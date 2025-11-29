<script setup lang="ts">
import { Command } from "vue-command-palette";
import { useCommandPalette } from "./useCommandPalette";

const { visible, instances, handleSelect, getInstanceLabel } =
  useCommandPalette();
</script>

<template>
  <Command.Dialog v-model:visible="visible" theme="httpworkbench">
    <template #header>
      <Command.Input placeholder="Search instances..." />
    </template>
    <template #body>
      <Command.List>
        <Command.Empty>No instances found.</Command.Empty>
        <Command.Group heading="Instances">
          <Command.Item
            v-for="instance in instances"
            :key="instance.id"
            :data-value="instance.id"
            @select="handleSelect"
          >
            <div class="flex items-center gap-3">
              <i class="pi pi-server text-surface-400"></i>
              <span>{{ getInstanceLabel(instance) }}</span>
              <span
                v-if="instance.label !== undefined && instance.label !== ''"
                class="text-surface-500 text-xs font-mono"
              >
                {{ instance.id }}
              </span>
            </div>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </template>
  </Command.Dialog>
</template>

<style>
[command-dialog-mask] {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
}

[command-dialog-wrapper] {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 560px;
  z-index: 1001;
  padding: 0 16px;
}

[command-dialog-header],
[command-dialog-body] {
  background: var(--p-surface-900);
  border: 1px solid var(--p-surface-700);
}

[command-dialog-header] {
  border-radius: 8px 8px 0 0;
  border-bottom: none;
}

[command-dialog-body] {
  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--p-surface-700);
}

[command-input] {
  width: 100%;
  padding: 16px;
  font-size: 16px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--p-surface-0);
}

[command-input]::placeholder {
  color: var(--p-surface-500);
}

[command-list] {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
}

[command-group-heading] {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-surface-500);
  padding: 8px 12px 4px;
}

[command-item] {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--p-surface-200);
}

[command-item][aria-selected="true"] {
  background: var(--p-surface-700);
  color: var(--p-surface-0);
}

[command-empty] {
  padding: 32px;
  text-align: center;
  color: var(--p-surface-500);
  font-size: 14px;
}

.command-dialog-enter-active,
.command-dialog-leave-active {
  transition: none;
}
</style>
