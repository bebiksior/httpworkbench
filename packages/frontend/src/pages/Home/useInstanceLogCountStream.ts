import { useQueryClient } from "@tanstack/vue-query";
import { useEventListener, useIntervalFn, useWebSocket } from "@vueuse/core";
import { storeToRefs } from "pinia";
import {
  GUEST_MAX_ACTIVE_INSTANCES,
  INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE,
  InstanceSummaryStreamServerMessageSchema,
  type GuestInstanceReference,
  type InstanceLogCount,
  type InstanceSummary,
  type InstanceSummaryStreamClientMessage,
  type InstanceSummaryStreamServerMessage,
} from "shared";
import { computed, type MaybeRefOrGetter, toValue, watch } from "vue";
import { apiPaths } from "@/api/paths";
import { instanceListQueryKey } from "@/queries/keys";
import { useAuthStore } from "@/stores/auth";
import { useGuestInstancesStore } from "@/stores/guestInstances";
import type { GuestInstanceRecord } from "@/stores/guestInstances.utils";

const STREAM_HEARTBEAT_INTERVAL_MS = 10_000;
const STREAM_HEARTBEAT_TIMEOUT_MS = 25_000;
const STREAM_PING = JSON.stringify({ type: "ping" });
const STREAM_PONG = JSON.stringify({ type: "pong" });

type CountUpdate = {
  counts: readonly InstanceLogCount[];
  removedInstanceIds?: readonly string[];
  authoritative?: boolean;
};

export const applyInstanceLogCountUpdate = (
  instances: readonly InstanceSummary[],
  update: CountUpdate,
): InstanceSummary[] => {
  const countsById = new Map(
    update.counts.map(({ instanceId, count }) => [instanceId, count]),
  );
  const removedIds = new Set(update.removedInstanceIds ?? []);
  let changed = false;
  const next: InstanceSummary[] = [];

  for (const instance of instances) {
    if (
      removedIds.has(instance.id) ||
      (update.authoritative === true && !countsById.has(instance.id))
    ) {
      changed = true;
      continue;
    }
    const count = countsById.get(instance.id);
    if (count === undefined || count === instance.logCount) {
      next.push(instance);
      continue;
    }
    changed = true;
    next.push({ ...instance, logCount: count });
  }

  return changed ? next : (instances as InstanceSummary[]);
};

export const parseInstanceSummaryStreamMessage = (
  data: unknown,
): InstanceSummaryStreamServerMessage | undefined => {
  if (typeof data !== "string") {
    return undefined;
  }
  try {
    const parsed = InstanceSummaryStreamServerMessageSchema.safeParse(
      JSON.parse(data),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const buildInstanceSummarySubscriptionMessages = (
  generation: number,
  isGuest: boolean,
  records: readonly GuestInstanceRecord[],
): InstanceSummaryStreamClientMessage[] => {
  const references: GuestInstanceReference[] = isGuest
    ? records
        .slice(0, GUEST_MAX_ACTIVE_INSTANCES)
        .map(({ id, token }) => ({ id, token }))
    : [];
  if (references.length === 0) {
    return [
      {
        type: "subscribe",
        generation,
        instances: [],
        complete: true,
      },
    ];
  }
  const messages: InstanceSummaryStreamClientMessage[] = [];
  for (
    let index = 0;
    index < references.length;
    index += INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE
  ) {
    const instances = references.slice(
      index,
      index + INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE,
    );
    messages.push({
      type: "subscribe",
      generation,
      instances,
      complete: index + instances.length === references.length,
    });
  }
  return messages;
};

type InstanceLogCountStreamControllerOptions = {
  enabled: MaybeRefOrGetter<boolean>;
  isFetching: MaybeRefOrGetter<boolean>;
  subscriptionSignature: MaybeRefOrGetter<string>;
  getSubscription: () => {
    isGuest: boolean;
    records: readonly GuestInstanceRecord[];
  };
  applyUpdate: (update: CountUpdate) => void;
};

export const useInstanceLogCountStreamController = (
  options: InstanceLogCountStreamControllerOptions,
) => {
  let subscriptionGeneration = 0;
  let expectedSequence = 0;
  let awaitingSnapshot = true;
  let needsResubscribe = false;
  const deferredCounts = new Map<string, number>();
  const deferredRemovedInstanceIds = new Set<string>();

  const isVisible = () => document.visibilityState === "visible";

  const resetProtocolState = () => {
    awaitingSnapshot = true;
    expectedSequence = 0;
    needsResubscribe = false;
    deferredCounts.clear();
    deferredRemovedInstanceIds.clear();
  };

  const applyOrDeferUpdate = (update: CountUpdate) => {
    if (!toValue(options.isFetching)) {
      options.applyUpdate(update);
      return;
    }
    for (const instanceId of update.removedInstanceIds ?? []) {
      deferredCounts.delete(instanceId);
      deferredRemovedInstanceIds.add(instanceId);
    }
    for (const { instanceId, count } of update.counts) {
      deferredRemovedInstanceIds.delete(instanceId);
      deferredCounts.set(instanceId, count);
    }
  };

  const applyDeferredUpdates = () => {
    if (deferredCounts.size === 0 && deferredRemovedInstanceIds.size === 0) {
      return;
    }
    options.applyUpdate({
      counts: [...deferredCounts].map(([instanceId, count]) => ({
        instanceId,
        count,
      })),
      removedInstanceIds: [...deferredRemovedInstanceIds],
    });
    deferredCounts.clear();
    deferredRemovedInstanceIds.clear();
  };

  const streamUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${apiPaths.instanceSummaryStream}`;

  const handleMessage = (data: unknown) => {
    const message = parseInstanceSummaryStreamMessage(data);
    if (
      message === undefined ||
      message.type === "pong" ||
      message.generation !== subscriptionGeneration
    ) {
      return;
    }
    if (message.type === "snapshot") {
      awaitingSnapshot = false;
      expectedSequence = message.sequence;
      applyOrDeferUpdate({
        counts: message.counts,
        authoritative: true,
      });
      return;
    }
    if (awaitingSnapshot || message.sequence <= expectedSequence) {
      return;
    }
    if (message.sequence !== expectedSequence + 1) {
      awaitingSnapshot = true;
      sendSubscription();
      return;
    }
    expectedSequence = message.sequence;
    applyOrDeferUpdate({
      counts: message.counts,
      removedInstanceIds: message.removedInstanceIds,
    });
  };

  const { status, ws, send, open, close } = useWebSocket(streamUrl, {
    immediate: false,
    autoConnect: false,
    autoReconnect: {
      retries: -1,
      delay: (attempt) => {
        const backoff = Math.min(10_000, 250 * 2 ** Math.min(attempt - 1, 6));
        return Math.round(backoff * (0.8 + Math.random() * 0.4));
      },
    },
    heartbeat: {
      message: STREAM_PING,
      responseMessage: STREAM_PONG,
      scheduler: (callback) =>
        useIntervalFn(callback, STREAM_HEARTBEAT_INTERVAL_MS, {
          immediate: false,
        }),
      pongTimeout: STREAM_HEARTBEAT_TIMEOUT_MS,
    },
    onConnected() {
      sendSubscription();
    },
    onDisconnected() {
      resetProtocolState();
    },
    onError(socket) {
      socket.close();
    },
    onMessage(_socket, event) {
      handleMessage(event.data);
    },
  });

  function sendSubscription() {
    if (status.value !== "OPEN" || !toValue(options.enabled) || !isVisible()) {
      return;
    }
    if (toValue(options.isFetching)) {
      needsResubscribe = true;
      return;
    }
    needsResubscribe = false;
    subscriptionGeneration += 1;
    awaitingSnapshot = true;
    expectedSequence = 0;
    const subscription = options.getSubscription();
    for (const message of buildInstanceSummarySubscriptionMessages(
      subscriptionGeneration,
      subscription.isGuest,
      subscription.records,
    )) {
      send(JSON.stringify(message), false);
    }
  }

  const openStream = () => {
    if (ws.value === undefined && toValue(options.enabled) && isVisible()) {
      open();
    }
  };

  const closeStream = () => {
    resetProtocolState();
    close();
  };

  watch(
    () => toValue(options.enabled),
    (enabled) => {
      if (enabled) {
        openStream();
      } else {
        closeStream();
      }
    },
    { immediate: true },
  );

  watch(
    () => toValue(options.isFetching),
    (isFetching, wasFetching) => {
      if (wasFetching && !isFetching) {
        if (needsResubscribe) {
          deferredCounts.clear();
          deferredRemovedInstanceIds.clear();
          sendSubscription();
        } else {
          applyDeferredUpdates();
        }
      }
    },
  );

  watch(
    () => toValue(options.subscriptionSignature),
    () => {
      sendSubscription();
    },
  );

  const onVisibilityChange = () => {
    if (!isVisible()) {
      closeStream();
      return;
    }
    openStream();
  };
  useEventListener(document, "visibilitychange", onVisibilityChange);
};

export const useInstanceLogCountStream = (options: {
  enabled: MaybeRefOrGetter<boolean>;
  instanceIds: MaybeRefOrGetter<readonly string[]>;
  isFetching: MaybeRefOrGetter<boolean>;
}) => {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const guestInstancesStore = useGuestInstancesStore();
  const { isGuest } = storeToRefs(authStore);
  const { ids, records } = storeToRefs(guestInstancesStore);
  const guestKey = computed(() => ids.value.join(","));
  const queryKey = computed(() =>
    instanceListQueryKey(isGuest.value, guestKey.value),
  );
  const subscriptionSignature = computed(() =>
    isGuest.value
      ? `guest:${records.value
          .map(({ id, token }) => `${id}:${token}`)
          .join(",")}`
      : `user:${toValue(options.instanceIds).join(",")}`,
  );

  useInstanceLogCountStreamController({
    ...options,
    subscriptionSignature,
    getSubscription: () => ({
      isGuest: isGuest.value,
      records: records.value,
    }),
    applyUpdate: (update) => {
      queryClient.setQueryData<InstanceSummary[]>(queryKey.value, (current) =>
        current === undefined
          ? undefined
          : applyInstanceLogCountUpdate(current, update),
      );
    },
  });
};
