<script setup lang="ts">
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import { useThemeStore } from "@/stores/theme";

useThemeStore();
</script>

<template>
  <Toast position="bottom-center" />
  <ConfirmDialog />
  <div class="min-h-dvh bg-surface-50 dark:bg-surface-900">
    <router-view />
  </div>
</template>
