<script setup lang="ts">
import { HttpEditor } from "@/components/HttpEditor";

defineProps<{
  raw: string;
}>();
</script>

<template>
  <HttpEditor
    :model-value="raw"
    syntax="smtp"
    readonly
    auto-height
    max-height="600px"
  />
</template>
