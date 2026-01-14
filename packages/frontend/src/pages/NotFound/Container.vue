<script setup lang="ts">
import Button from "primevue/button";
import { useRouter } from "vue-router";

const router = useRouter();

const goHome = () => {
  router.push({ name: "home" });
};
</script>

<template>
  <div
    class="flex items-center justify-center min-h-screen bg-surface-50 dark:bg-surface-900"
  >
    <div class="text-center p-8">
      <h1 class="text-9xl font-bold text-primary mb-4">404</h1>
      <h2 class="text-3xl font-semibold text-surface-900 dark:text-surface-0">
        Page Not Found
      </h2>
      <p class="text-surface-400 mb-8">
        The page you're looking for doesn't exist :-(
      </p>
      <Button label="Go Home" icon="pi pi-home" @mousedown="goHome" />
    </div>
  </div>
</template>
