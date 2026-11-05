<script setup lang="ts">
import { computed } from "vue";
import { emailDocument } from "../../mail";
import type { SanitizedEmail } from "../../sanitizeEmail";

const props = defineProps<{
  email: SanitizedEmail;
  allowRemote: boolean;
}>();

const srcdoc = computed(() => emailDocument(props.email, props.allowRemote));
</script>

<template>
  <iframe
    :srcdoc="srcdoc"
    sandbox="allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    title="Message content"
    class="block size-full border-0 bg-white"
  />
</template>
