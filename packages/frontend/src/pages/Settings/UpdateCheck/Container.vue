<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";
import { config } from "@/config";
import { useUpdateCheck } from "./useUpdateCheck";

const { state, checkForUpdates } = useUpdateCheck();
</script>

<template>
  <div class="bg-surface-900/70 border border-surface-800 rounded-2xl p-6 mb-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h2 class="text-2xl font-semibold text-surface-0">Version</h2>
          <Tag :value="`v${config.version}`" severity="secondary" />
        </div>
        <p class="text-sm text-surface-400 mt-1">
          <template v-if="state.status === 'idle'">
            Click to check for updates
          </template>
          <template v-else-if="state.status === 'checking'">
            Checking for updates...
          </template>
          <template v-else-if="state.status === 'up-to-date'">
            You're running the latest version
          </template>
          <template v-else-if="state.status === 'update-available'">
            A new version ({{ state.release.tag_name }}) is available
          </template>
          <template v-else-if="state.status === 'error'">
            {{ state.message }}
          </template>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          v-if="state.status === 'update-available'"
          label="View Release"
          icon="pi pi-external-link"
          as="a"
          :href="state.release.html_url"
          target="_blank"
        />
        <Button
          v-if="state.status !== 'checking'"
          :label="state.status === 'idle' ? 'Check' : 'Recheck'"
          icon="pi pi-refresh"
          outlined
          @click="checkForUpdates"
        />
      </div>
    </div>
  </div>
</template>
