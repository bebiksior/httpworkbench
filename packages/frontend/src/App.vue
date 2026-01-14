<script setup lang="ts">
import Toast from "primevue/toast";
import { useThemeStore } from "@/stores/theme";

useThemeStore();
</script>

<template>
  <Toast position="bottom-center" />
  <div class="min-h-screen bg-surface-50 dark:bg-surface-900">
    <router-view />
  </div>
</template>
