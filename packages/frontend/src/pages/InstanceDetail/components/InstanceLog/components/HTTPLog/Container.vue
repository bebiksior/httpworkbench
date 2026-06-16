<script setup lang="ts">
import { HttpEditor } from "@/components/HttpEditor";
import type { Log } from "shared";

defineProps<{
  log: Log;
}>();
</script>

<template>
  <HttpEditor :model-value="log.raw" syntax="http" readonly height="414px" />
</template>
