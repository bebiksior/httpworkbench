<script setup lang="ts">
import { HttpEditor } from "@/components/HttpEditor";
import type { Log } from "shared";

defineProps<{
  log: Log;
}>();
</script>

<template>
  <HttpEditor :model-value="log.raw" readonly auto-height max-height="600px" />
</template>
