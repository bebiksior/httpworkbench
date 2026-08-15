<script setup lang="ts">
import Message from "primevue/message";
import ToggleSwitch from "primevue/toggleswitch";
import { computed } from "vue";
import { ApiKeyProvider } from "./components/ApiKeyProvider";
import { SubscriptionProvider } from "./components/SubscriptionProvider";
import { API_KEY_PROVIDERS, SUBSCRIPTION_PROVIDERS } from "./providers";
import { useAi } from "./useAi";

const {
  aiEnabled,
  apiKeys,
  subscriptions,
  connectionStates,
  saveKey,
  removeKey,
  connectSubscription,
  cancelConnection,
  disconnectSubscription,
} = useAi();

const configuredKeyCount = computed(
  () =>
    API_KEY_PROVIDERS.filter((provider) => apiKeys.value[provider.id] !== "")
      .length,
);

const connectedAccountCount = computed(
  () =>
    SUBSCRIPTION_PROVIDERS.filter(
      (provider) => subscriptions.value[provider.id] !== undefined,
    ).length,
);
</script>

<template>
  <div class="min-w-0 max-w-full sm:max-w-3xl">
    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        AI
      </h2>
      <p class="mt-1 max-w-2xl text-sm text-surface-600 dark:text-surface-300">
        Connect the providers that power the assistant. Credentials are saved
        only in this browser.
      </p>
    </div>

    <div
      class="mb-6 rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800 sm:p-5"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <label
            for="ai-enabled"
            class="cursor-pointer text-base font-semibold text-surface-900 dark:text-surface-0"
          >
            Enable AI features
          </label>
          <p class="mt-1 text-sm text-surface-600 dark:text-surface-300">
            Turn this off to switch off the assistant and stop all model
            requests. Saved providers stay on this device.
          </p>
        </div>
        <ToggleSwitch
          v-model="aiEnabled"
          input-id="ai-enabled"
          class="shrink-0"
        />
      </div>
    </div>

    <Message
      v-if="!aiEnabled"
      severity="secondary"
      :closable="false"
      class="mb-6"
    >
      AI features are off. Turn them back on to manage providers.
    </Message>

    <div class="transition-opacity" :class="aiEnabled ? '' : 'opacity-60'">
      <section class="mb-8">
        <div class="mb-3 flex items-end justify-between gap-3">
          <div class="min-w-0">
            <h3
              class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
            >
              API keys
            </h3>
            <p class="mt-1 text-sm text-surface-600 dark:text-surface-300">
              Pay per token with a key from the provider.
            </p>
          </div>
          <span
            class="shrink-0 text-xs text-surface-500 dark:text-surface-400"
            aria-live="polite"
          >
            {{ configuredKeyCount }} of {{ API_KEY_PROVIDERS.length }} set
          </span>
        </div>

        <div class="flex flex-col gap-3">
          <ApiKeyProvider
            v-for="provider in API_KEY_PROVIDERS"
            :key="provider.id"
            :provider="provider"
            :secret="apiKeys[provider.id]"
            :disabled="!aiEnabled"
            @save="(value) => saveKey(provider, value)"
            @remove="removeKey(provider)"
          />
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-end justify-between gap-3">
          <div class="min-w-0">
            <h3
              class="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
            >
              Subscription accounts
            </h3>
            <p class="mt-1 text-sm text-surface-600 dark:text-surface-300">
              Use models included with a plan you already pay for.
            </p>
          </div>
          <span
            class="shrink-0 text-xs text-surface-500 dark:text-surface-400"
            aria-live="polite"
          >
            {{ connectedAccountCount }} of
            {{ SUBSCRIPTION_PROVIDERS.length }} connected
          </span>
        </div>

        <div class="flex flex-col gap-3">
          <SubscriptionProvider
            v-for="provider in SUBSCRIPTION_PROVIDERS"
            :key="provider.id"
            :provider="provider"
            :credentials="subscriptions[provider.id]"
            :connection="connectionStates[provider.id]"
            :disabled="!aiEnabled"
            @connect="connectSubscription(provider)"
            @cancel="cancelConnection(provider.id)"
            @disconnect="disconnectSubscription(provider)"
          />
        </div>
      </section>
    </div>

    <p
      class="mt-6 flex items-start gap-2 text-xs text-surface-500 dark:text-surface-400"
    >
      <i class="pi pi-lock mt-0.5 shrink-0 text-[0.7rem]" />
      <span>
        Credentials are stored in localStorage. Subscription sign-in and ChatGPT
        requests pass through this HTTP Workbench server, but credentials are
        not persisted there.
      </span>
    </p>
  </div>
</template>
