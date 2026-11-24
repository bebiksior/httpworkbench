<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { Mailbox, MailFolder } from "shared";
import { computed, ref } from "vue";
import { config } from "@/config";
import { formatExpiry } from "../../mail";

const props = defineProps<{
  mailbox: Mailbox;
  folder: MailFolder;
}>();

const emit = defineEmits<{
  back: [];
  compose: [];
  edit: [];
  extend: [];
  keepForever: [];
  toggleLock: [];
  clear: [];
  delete: [];
}>();

const menu = ref<InstanceType<typeof Menu>>();

const title = computed(
  () => props.mailbox.label ?? `Mailbox ${props.mailbox.id}`,
);
const expiry = computed(() => formatExpiry(props.mailbox.expiresAt));

const menuItems = computed(() => [
  { label: "Edit", icon: "pi pi-pencil", command: () => emit("edit") },
  ...(props.mailbox.expiresAt === undefined
    ? []
    : [
        { label: "Extend", icon: "pi pi-clock", command: () => emit("extend") },
        ...(config.isHosted
          ? []
          : [
              {
                label: "Keep forever",
                icon: "pi pi-bookmark",
                command: () => emit("keepForever"),
              },
            ]),
      ]),
  {
    label: props.mailbox.locked ? "Unlock" : "Lock",
    icon: props.mailbox.locked ? "pi pi-lock-open" : "pi pi-lock",
    command: () => emit("toggleLock"),
  },
  {
    label: props.folder === "sent" ? "Clear sent" : "Clear inbox",
    icon: "pi pi-eraser",
    command: () => emit("clear"),
  },
  { separator: true },
  {
    label: props.mailbox.locked ? "Unlock to delete" : "Delete mailbox",
    icon: "pi pi-trash",
    class: "mailbox-menu-danger",
    disabled: props.mailbox.locked,
    command: () => emit("delete"),
  },
]);

const { copy, copied } = useClipboard({ copiedDuring: 1200, legacy: true });
const copyAddress = () => copy(props.mailbox.address);
</script>

<template>
  <header
    class="flex h-16 shrink-0 items-center gap-2 border-b border-surface-200 bg-white px-2 sm:gap-3 sm:px-4 dark:border-surface-700 dark:bg-surface-800"
  >
    <Button
      icon="pi pi-arrow-left"
      severity="secondary"
      text
      rounded
      class="shrink-0"
      aria-label="Back"
      @click="emit('back')"
    />
    <div class="min-w-0 flex-1">
      <p
        class="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-surface-900 dark:text-surface-0"
      >
        <span class="truncate">{{ title }}</span>
        <i
          v-if="mailbox.locked"
          class="pi pi-lock shrink-0 text-xs text-surface-400"
          aria-label="Locked"
        />
      </p>
      <button
        type="button"
        class="group/address flex max-w-full items-center gap-1.5 rounded font-mono text-xs text-surface-500 transition-colors duration-150 hover:text-surface-900 focus-visible:outline-2 focus-visible:outline-primary dark:text-surface-400 dark:hover:text-surface-0"
        :title="`Copy ${mailbox.address}`"
        @click="copyAddress"
      >
        <span class="truncate select-text">{{ mailbox.address }}</span>
        <i
          class="pi text-[10px] transition-opacity duration-150 group-hover/address:opacity-100"
          :class="copied ? 'pi-check opacity-100' : 'pi-copy opacity-0'"
          aria-hidden="true"
        />
      </button>
    </div>
    <span
      v-if="expiry"
      class="hidden shrink-0 text-xs text-surface-400 tabular-nums md:inline"
    >
      {{ expiry }}
    </span>
    <Button
      v-if="config.smtpSendingEnabled"
      label="Compose"
      icon="pi pi-pen-to-square"
      size="small"
      class="shrink-0"
      :pt="{ label: { class: 'hidden sm:inline' } }"
      aria-label="Compose"
      @click="emit('compose')"
    />
    <Button
      icon="pi pi-ellipsis-h"
      severity="secondary"
      text
      rounded
      aria-label="Mailbox actions"
      aria-haspopup="true"
      @click="menu?.toggle($event)"
    />
    <Menu ref="menu" :model="menuItems" popup />
  </header>
</template>

<style>
.mailbox-menu-danger .p-menu-item-label,
.mailbox-menu-danger .p-menu-item-icon {
  color: var(--p-red-500) !important;
}
</style>
