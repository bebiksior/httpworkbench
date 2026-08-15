<script setup lang="ts">
import ToggleSwitch from "primevue/toggleswitch";
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
</script>

<template>
  <div class="min-w-0 max-w-full sm:max-w-3xl">
    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        AI
      </h2>
      <p class="mt-1 max-w-2xl text-sm text-surface-600 dark:text-surface-300">
        Connect a provider to power the assistant. Credentials are saved only in
        this browser.
      </p>
    </div>

    <div
      class="rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800"
    >
      <div class="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <div class="min-w-0">
          <label
            for="ai-enabled"
            class="cursor-pointer text-sm font-medium text-surface-900 dark:text-surface-0"
          >
            Enable AI features
          </label>
          <p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
            When off, the assistant is hidden and no model requests are made.
          </p>
        </div>
        <ToggleSwitch
          v-model="aiEnabled"
          input-id="ai-enabled"
          class="shrink-0"
        />
      </div>

      <div
        class="pb-3 transition-opacity"
        :class="aiEnabled ? '' : 'opacity-60'"
      >
        <section>
          <h3
            class="px-4 pb-1 pt-4 text-xs font-medium text-surface-500 dark:text-surface-400 sm:px-5"
          >
            API keys
          </h3>
          <div>
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

        <section class="mt-2">
          <h3
            class="px-4 pb-1 pt-4 text-xs font-medium text-surface-500 dark:text-surface-400 sm:px-5"
          >
            Subscriptions
          </h3>
          <div>
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
    </div>

    <p class="mt-4 text-xs text-surface-500 dark:text-surface-400">
      Credentials are stored in this browser's localStorage. Subscription
      sign-in and ChatGPT requests pass through this HTTP Workbench server, but
      credentials are not persisted there.
    </p>
  </div>
</template>
