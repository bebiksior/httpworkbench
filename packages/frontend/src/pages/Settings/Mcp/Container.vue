<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { ref } from "vue";
import { getMcpEndpoint } from "@/config";

defineEmits<{
  (e: "navigate-to-api-keys"): void;
}>();

const mcpEndpoint = getMcpEndpoint();
const endpointCopied = ref(false);
const configCopied = ref(false);
let copyResetHandle: ReturnType<typeof setTimeout> | undefined;
let configCopyResetHandle: ReturnType<typeof setTimeout> | undefined;

const mcpConfigExample = JSON.stringify(
  {
    mcpServers: {
      httpworkbench: {
        type: "http",
        url: mcpEndpoint,
        headers: {
          Authorization: "Bearer YOUR_HTTP_WORKBENCH_API_KEY",
        },
      },
    },
  },
  undefined,
  2,
);

const copyEndpoint = async () => {
  await navigator.clipboard.writeText(mcpEndpoint);
  endpointCopied.value = true;
  if (copyResetHandle !== undefined) {
    clearTimeout(copyResetHandle);
  }
  copyResetHandle = setTimeout(() => {
    endpointCopied.value = false;
  }, 2000);
};

const copyConfigExample = async () => {
  await navigator.clipboard.writeText(mcpConfigExample);
  configCopied.value = true;
  if (configCopyResetHandle !== undefined) {
    clearTimeout(configCopyResetHandle);
  }
  configCopyResetHandle = setTimeout(() => {
    configCopied.value = false;
  }, 2000);
};
</script>

<template>
  <div class="min-w-0 max-w-full overflow-hidden sm:max-w-2xl">
    <div class="mb-6 sm:mb-8">
      <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        MCP
      </h2>
      <p
        class="mt-1 break-words text-sm text-surface-600 dark:text-surface-300"
      >
        Connect AI clients like Cursor or Claude to HTTP Workbench using the
        Model Context Protocol.
      </p>
    </div>

    <div class="mb-6 flex flex-col gap-2 sm:mb-8">
      <label
        for="mcp-endpoint"
        class="text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        Endpoint
      </label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <InputText
          id="mcp-endpoint"
          :model-value="mcpEndpoint"
          readonly
          class="min-w-0 w-full font-mono"
        />
        <Button
          :label="endpointCopied ? 'Copied' : 'Copy'"
          :icon="endpointCopied ? 'pi pi-check' : 'pi pi-copy'"
          severity="secondary"
          outlined
          class="w-full sm:w-auto"
          @click="copyEndpoint"
        />
      </div>
      <p class="break-words text-xs text-surface-500 dark:text-surface-400">
        Use as the Streamable HTTP MCP server URL in your client.
      </p>
    </div>

    <div class="mb-6 sm:mb-8">
      <h3
        class="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        Authentication
      </h3>
      <p
        class="mb-3 break-words text-sm text-surface-600 dark:text-surface-300"
      >
        Authorize requests with an API key sent as a bearer token. Create a
        scoped key first, then paste it into your MCP client.
      </p>
      <Button
        label="Manage API keys"
        icon="pi pi-key"
        outlined
        class="w-full sm:w-auto"
        @click="$emit('navigate-to-api-keys')"
      />
    </div>

    <div class="mb-6 sm:mb-8">
      <div
        class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <h3 class="text-sm font-medium text-surface-700 dark:text-surface-200">
          Example client JSON
        </h3>
        <Button
          :label="configCopied ? 'Copied' : 'Copy JSON'"
          :icon="configCopied ? 'pi pi-check' : 'pi pi-copy'"
          severity="secondary"
          size="small"
          outlined
          class="w-full sm:w-auto"
          @click="copyConfigExample"
        />
      </div>
      <p
        class="mb-3 break-words text-sm text-surface-600 dark:text-surface-300"
      >
        Most MCP clients use an <span class="font-mono">mcpServers</span>
        object. Paste this into your client config, then replace the bearer
        token placeholder with an API key.
      </p>
      <pre
        class="max-w-full overflow-x-auto rounded-lg border border-surface-200 bg-surface-50 p-4 text-xs text-surface-800 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
      ><code>{{ mcpConfigExample }}</code></pre>
    </div>

    <div class="mb-8">
      <h3
        class="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        What you can do
      </h3>
      <ul
        class="space-y-1 text-sm text-surface-600 dark:text-surface-300 list-disc pl-5"
      >
        <li>Create static HTTP response instances</li>
        <li>List, update, and delete owned instances</li>
        <li>Read or watch HTTP and DNS request logs</li>
      </ul>
    </div>

    <div>
      <h3
        class="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200"
      >
        Setup
      </h3>
      <ol
        class="space-y-1 text-sm text-surface-600 dark:text-surface-300 list-decimal pl-5"
      >
        <li>Create an API key with the scopes your client needs.</li>
        <li>Add an MCP server in your client using the endpoint above.</li>
        <li>Send the API key as the Authorization bearer token.</li>
      </ol>
    </div>
  </div>
</template>
