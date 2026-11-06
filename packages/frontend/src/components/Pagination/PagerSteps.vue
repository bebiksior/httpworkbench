<script setup lang="ts">
import Button from "primevue/button";

defineProps<{ page: number; pageCount: number; rangeText: string }>();
const emit = defineEmits<{ "update:page": [page: number] }>();
</script>

<template>
  <div class="flex w-full items-center gap-2 sm:mr-2 sm:w-auto">
    <span class="mr-auto text-sm text-surface-400 tabular-nums sm:mr-1">
      {{ rangeText }}
    </span>
    <Button
      icon="pi pi-chevron-left"
      severity="secondary"
      outlined
      :disabled="page <= 1"
      aria-label="Previous page"
      @click="emit('update:page', page - 1)"
    />
    <Button
      icon="pi pi-chevron-right"
      severity="secondary"
      outlined
      :disabled="page >= pageCount"
      aria-label="Next page"
      @click="emit('update:page', page + 1)"
    />
  </div>
</template>
