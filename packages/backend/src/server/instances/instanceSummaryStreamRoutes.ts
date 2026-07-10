import { Elysia, status } from "elysia";
import {
  GUEST_MAX_ACTIVE_INSTANCES,
  GUEST_OWNER_ID,
  INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE,
  InstanceSummaryStreamClientMessageSchema,
  type GuestInstanceReference,
  type InstanceLogCount,
} from "shared";
import { instancePolicies } from "../../config";
import {
  getInstanceLogCountsByIds,
  getInstanceLogCountsByOwner,
} from "../../storage";
import {
  apiKeyMissingScope,
  enforceApiKeyRateLimit,
  readSessionCookie,
  resolveOptionalAccess,
} from "../auth";
import { authenticateGuestInstanceReferences } from "../guestAccess";
import { createBoundedProtocolRateLimiter } from "../protocolRateLimit";
import { isAllowedWebSocketOrigin } from "../webSocketOrigin";
import {
  replaceInstanceSummarySubscriptions,
  unsubscribeFromInstanceSummaryStream,
  type InstanceSummaryStreamSocket,
} from "./instanceSummaryStream";

const connectionRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  maxEntries: 10_000,
});
const subscriptionRateLimiter = createBoundedProtocolRateLimiter({
  maxRequests: 120,
  windowMs: 60_000,
  maxEntries: 10_000,
});

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const MAX_CONNECTIONS_PER_CLIENT = 20;
const MAX_CONNECTIONS = 10_000;

const accessBySocket = new Map<
  InstanceSummaryStreamSocket,
  ReturnType<typeof resolveOptionalAccess>
>();
const pendingGuestReferences = new Map<
  InstanceSummaryStreamSocket,
  { generation: number; references: GuestInstanceReference[] }
>();
const socketClientKeys = new Map<InstanceSummaryStreamSocket, string>();
const connectionCountsByClient = new Map<string, number>();
const subscriptionTimeouts = new Map<
  InstanceSummaryStreamSocket,
  ReturnType<typeof setTimeout>
>();

const clientKey = (request: Request) =>
  request.headers.get("x-internal-real-ip") ?? "unknown";

const clearSubscriptionTimeout = (socket: InstanceSummaryStreamSocket) => {
  const timeout = subscriptionTimeouts.get(socket);
  if (timeout !== undefined) {
    clearTimeout(timeout);
    subscriptionTimeouts.delete(socket);
  }
};

const cleanupSocket = (socket: InstanceSummaryStreamSocket) => {
  clearSubscriptionTimeout(socket);
  unsubscribeFromInstanceSummaryStream(socket);
  accessBySocket.delete(socket);
  pendingGuestReferences.delete(socket);
  const key = socketClientKeys.get(socket);
  socketClientKeys.delete(socket);
  if (key === undefined) {
    return;
  }
  const next = (connectionCountsByClient.get(key) ?? 1) - 1;
  if (next <= 0) {
    connectionCountsByClient.delete(key);
  } else {
    connectionCountsByClient.set(key, next);
  }
};

const armSubscriptionTimeout = (
  socket: InstanceSummaryStreamSocket,
  onTimeout: () => void,
) => {
  clearSubscriptionTimeout(socket);
  const timeout = setTimeout(() => {
    subscriptionTimeouts.delete(socket);
    pendingGuestReferences.delete(socket);
    onTimeout();
  }, SUBSCRIBE_TIMEOUT_MS);
  timeout.unref?.();
  subscriptionTimeouts.set(socket, timeout);
};

const loadGuestCounts = (references: GuestInstanceReference[]) => {
  const authorizedIds = new Set<string>();
  for (
    let index = 0;
    index < references.length;
    index += INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE
  ) {
    for (const id of authenticateGuestInstanceReferences(
      references.slice(index, index + INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE),
    )) {
      authorizedIds.add(id);
    }
  }
  const ids = [...authorizedIds];
  const counts: InstanceLogCount[] = [];
  for (
    let index = 0;
    index < ids.length;
    index += INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE
  ) {
    counts.push(
      ...getInstanceLogCountsByIds(
        ids.slice(index, index + INSTANCE_SUMMARY_SUBSCRIPTION_BATCH_SIZE),
        GUEST_OWNER_ID,
      ),
    );
  }
  return counts;
};

export const instanceSummaryStreamRoutes = new Elysia({
  name: "routes/instance-summary-stream",
}).ws("/api/instance-summaries/stream", {
  body: InstanceSummaryStreamClientMessageSchema,
  beforeHandle({ request }) {
    if (!isAllowedWebSocketOrigin(request)) {
      return status(403, { error: "Invalid origin" });
    }
    const key = clientKey(request);
    if (
      accessBySocket.size >= MAX_CONNECTIONS ||
      (connectionCountsByClient.get(key) ?? 0) >= MAX_CONNECTIONS_PER_CLIENT ||
      !connectionRateLimiter.check(key, Date.now())
    ) {
      return status(429, { error: "Summary stream limit exceeded" });
    }
  },
  open(ws) {
    const socket = ws.raw;
    const key = clientKey(ws.data.request);
    socketClientKeys.set(socket, key);
    connectionCountsByClient.set(
      key,
      (connectionCountsByClient.get(key) ?? 0) + 1,
    );
    accessBySocket.set(
      socket,
      resolveOptionalAccess(ws.data.request, readSessionCookie(ws.data.cookie)),
    );
    armSubscriptionTimeout(socket, () => {
      cleanupSocket(socket);
      ws.close(1008, "Subscription required");
    });
  },
  async message(ws, message) {
    const socket = ws.raw;
    if (message.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (!subscriptionRateLimiter.check(String(ws.id), Date.now())) {
      cleanupSocket(socket);
      ws.close(1008, "Subscription rate exceeded");
      return;
    }

    let pending = pendingGuestReferences.get(socket);
    if (pending?.generation !== message.generation) {
      pending = { generation: message.generation, references: [] };
      pendingGuestReferences.set(socket, pending);
      armSubscriptionTimeout(socket, () => {
        cleanupSocket(socket);
        ws.close(1008, "Incomplete subscription");
      });
    }
    pending.references.push(...message.instances);
    if (pending.references.length > GUEST_MAX_ACTIVE_INSTANCES) {
      cleanupSocket(socket);
      ws.close(1008, "Too many instance references");
      return;
    }
    if (!message.complete) {
      return;
    }

    pendingGuestReferences.delete(socket);
    clearSubscriptionTimeout(socket);
    const access = await accessBySocket.get(socket);
    if (access !== undefined) {
      if (
        !enforceApiKeyRateLimit(access) ||
        apiKeyMissingScope(access, "instances:read")
      ) {
        cleanupSocket(socket);
        ws.close(1008, "Insufficient access");
        return;
      }
      replaceInstanceSummarySubscriptions(
        socket,
        getInstanceLogCountsByOwner(access.user.id),
        message.generation,
      );
      return;
    }
    if (!instancePolicies.allowGuest) {
      cleanupSocket(socket);
      ws.close(1008, "Guest access is disabled");
      return;
    }
    replaceInstanceSummarySubscriptions(
      socket,
      loadGuestCounts(pending.references),
      message.generation,
    );
  },
  close(ws) {
    cleanupSocket(ws.raw);
  },
});
