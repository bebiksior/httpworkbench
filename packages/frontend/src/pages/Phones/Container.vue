<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { useMediaQuery } from "@vueuse/core";
import type { Phone, PhoneWake } from "shared";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useNotify } from "@/composables";
import {
  usePhoneProviders,
  usePhones,
  useWakePhone,
} from "@/queries/domains/usePhones";
import { NotesDialog } from "./components/NotesDialog";
import { PhoneList } from "./components/PhoneList";
import { SmsList } from "./components/SmsList";
import { Toolbar } from "./components/Toolbar";
import { formatWakeWindow } from "./phone";

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const isWide = useMediaQuery("(min-width: 1024px)");

const providersQuery = usePhoneProviders();
const hasProvider = computed(
  () => (providersQuery.data.value?.length ?? 0) > 0,
);
const { data: phones, isLoading, error, refetch } = usePhones(hasProvider);
const phoneList = computed(() => phones.value ?? []);

const selectedId = computed(() => {
  const requested = route.query.phone;
  if (typeof requested === "string" && requested !== "") {
    return requested;
  }
  return isWide.value ? phoneList.value[0]?.id : undefined;
});
const selected = computed(() =>
  phoneList.value.find((phone) => phone.id === selectedId.value),
);

const selectPhone = (id: string | undefined) =>
  router.replace({ query: id === undefined ? {} : { phone: id } });

const wakeMutation = useWakePhone();
const wakes = ref<Record<string, PhoneWake>>({});

const wake = () => {
  const phone = selected.value;
  if (phone === undefined) return;
  wakeMutation.mutate(phone.id, {
    onSuccess: (result) => {
      wakes.value = { ...wakes.value, [phone.id]: result };
      if (result.scheduled) {
        notify.success(formatWakeWindow(result) ?? "Wake scheduled");
      } else {
        notify.warn("Wake was not scheduled", "Try again in a moment.");
      }
    },
    onError: (err) => notify.error("Failed to wake line", err),
  });
};

const editingPhone = ref<Phone>();
</script>

<template>
  <div
    v-if="providersQuery.isSuccess.value && !hasProvider"
    class="flex h-full flex-col items-center justify-center gap-3 bg-surface-50 px-6 text-center dark:bg-surface-900"
  >
    <p class="font-medium text-surface-800 dark:text-surface-100">
      No phone provider
    </p>
    <p class="max-w-sm text-sm text-surface-500">
      Connect your SMS provider account to see its numbers and SMS here and in
      MCP.
    </p>
    <Button
      label="Open settings"
      severity="secondary"
      outlined
      size="small"
      @click="router.push({ name: 'settings', query: { section: 'phones' } })"
    />
  </div>

  <div
    v-else
    class="flex h-full min-h-0 flex-col bg-surface-50 dark:bg-surface-900"
  >
    <Toolbar
      :phone="selected"
      :phone-count="phoneList.length"
      :wake="selected ? wakes[selected.id] : undefined"
      :is-waking="wakeMutation.isPending.value"
      @back="selectPhone(undefined)"
      @wake="wake"
      @edit-notes="editingPhone = selected"
    />
    <Message
      v-if="error || providersQuery.error.value"
      severity="error"
      :closable="false"
      class="m-3 flex items-center justify-between gap-4"
    >
      <span class="flex-1">{{
        (error ?? providersQuery.error.value)?.message
      }}</span>
      <Button
        label="Retry"
        size="small"
        text
        severity="contrast"
        @click="error ? refetch() : providersQuery.refetch()"
      />
    </Message>
    <div
      v-if="phoneList.length > 0 || (!error && !providersQuery.error.value)"
      class="flex min-h-0 flex-1"
    >
      <aside
        class="w-full min-w-0 flex-col border-r border-surface-200 bg-white lg:flex lg:w-[22rem] lg:shrink-0 xl:w-[26rem] dark:border-surface-700 dark:bg-surface-800"
        :class="selected ? 'hidden' : 'flex'"
      >
        <PhoneList
          :phones="phoneList"
          :selected-id="selectedId"
          :is-loading="providersQuery.isLoading.value || isLoading"
          @select="selectPhone"
        />
      </aside>
      <section
        class="min-w-0 flex-1 lg:block"
        :class="selected ? 'block' : 'hidden'"
      >
        <SmsList v-if="selected" :key="selected.id" :phone="selected" />
        <div
          v-else
          class="flex h-full items-center justify-center text-sm text-surface-400"
        >
          Select a number
        </div>
      </section>
    </div>

    <NotesDialog
      v-if="editingPhone"
      :visible="true"
      :phone="editingPhone"
      @update:visible="editingPhone = undefined"
    />
  </div>
</template>
