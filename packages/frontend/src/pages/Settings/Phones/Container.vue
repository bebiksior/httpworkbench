<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { PhoneProviderIdSchema } from "shared";
import { usePhoneProviders } from "@/queries/domains/usePhones";
import { ProviderRow } from "./components/ProviderRow";

const { data: configs, isLoading, error, refetch } = usePhoneProviders();

const configFor = (provider: string) =>
  configs.value?.find((config) => config.provider === provider);
</script>

<template>
  <div class="min-w-0 max-w-full sm:max-w-3xl">
    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        Phones
      </h2>
      <p class="mt-1 max-w-2xl text-sm text-surface-600 dark:text-surface-300">
        Connect an SMS provider so its numbers and SMS show up under Phones and
        in MCP.
      </p>
    </div>

    <Message
      v-if="error"
      severity="error"
      :closable="false"
      class="mb-6 flex items-center justify-between gap-4"
    >
      <span class="flex-1">{{ error.message }}</span>
      <Button
        label="Retry"
        size="small"
        text
        severity="contrast"
        @click="refetch()"
      />
    </Message>

    <div v-if="isLoading" class="flex justify-center py-12">
      <i
        class="pi pi-spinner pi-spin text-4xl text-surface-500 dark:text-surface-300"
      />
    </div>
    <div
      v-else-if="!error"
      class="rounded-lg border border-surface-200 bg-white py-1 dark:border-surface-700 dark:bg-surface-800"
    >
      <ProviderRow
        v-for="provider in PhoneProviderIdSchema.options"
        :key="provider"
        :provider-id="provider"
        :config="configFor(provider)"
      />
    </div>
    <p class="mt-4 text-xs text-surface-500 dark:text-surface-400">
      Credentials are encrypted on this server and only used for your own
      requests. Saved keys are never shown again.
    </p>
  </div>
</template>
