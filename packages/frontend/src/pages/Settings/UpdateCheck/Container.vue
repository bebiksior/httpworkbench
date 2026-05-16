<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";
import { config } from "@/config";
import { useUpdateCheck } from "./useUpdateCheck";

const { state, checkForUpdates } = useUpdateCheck();
</script>

<template>
  <div>
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div class="flex items-center gap-3">
          <h2
            class="text-2xl font-semibold text-surface-900 dark:text-surface-0"
          >
            Version
          </h2>
          <Tag :value="`v${config.version}`" severity="secondary" />
        </div>
        <p class="text-sm text-surface-600 dark:text-surface-300 mt-1">
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
            A new version ({{ state.release.tag_name }}) is available. Run:
            <code
              class="mt-2 block overflow-x-auto rounded bg-surface-200 px-2 py-0.5 text-surface-700 dark:bg-surface-800 dark:text-surface-200 sm:ml-1 sm:mt-0 sm:inline"
            >
              docker compose down && git pull && docker compose up -d --build
            </code>
          </template>
          <template v-else-if="state.status === 'error'">
            {{ state.message }}
          </template>
        </p>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          v-if="state.status === 'update-available'"
          label="View Release"
          icon="pi pi-external-link"
          as="a"
          :href="state.release.html_url"
          target="_blank"
          class="w-full sm:w-auto"
        />
        <Button
          v-if="state.status !== 'checking'"
          :label="state.status === 'idle' ? 'Check' : 'Recheck'"
          icon="pi pi-refresh"
          outlined
          class="w-full sm:w-auto"
          @click="checkForUpdates"
        />
      </div>
    </div>
  </div>
</template>
