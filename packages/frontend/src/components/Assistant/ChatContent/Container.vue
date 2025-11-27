<script setup lang="ts">
import Error from "./Error.vue";
import NoMessages from "./NoMessages.vue";
import Success from "./Success.vue";
import { useContent } from "./useContent";

const { hasMessages, error } = useContent();
</script>

<template>
  <NoMessages v-if="!hasMessages" />
  <Error v-else-if="error" />
  <Success v-else />
</template>
