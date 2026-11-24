<script lang="ts">
const FIT_MAX_HEIGHT_PX = 600;
const measuredHeights = new Map<string, number>();
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { emailDocument } from "./emailDocument";
import type { SanitizedEmail } from "./sanitizeEmail";

const props = defineProps<{
  email: SanitizedEmail;
  allowRemote: boolean;
  fitContent?: boolean;
}>();

const srcdoc = computed(() => emailDocument(props.email, props.allowRemote));

// Measuring needs same-origin access; scripts stay blocked by the sandbox and CSP.
const sandbox = computed(() =>
  props.fitContent === true
    ? "allow-popups allow-popups-to-escape-sandbox allow-same-origin"
    : "allow-popups allow-popups-to-escape-sandbox",
);

// Virtualized rows remount often; reuse the last measured height to avoid a jump.
const height = ref<number | undefined>(measuredHeights.get(srcdoc.value));
let observer: ResizeObserver | undefined;

const measure = (frame: HTMLIFrameElement) => {
  const root = frame.contentDocument?.documentElement;
  if (root === undefined || root === null) {
    return;
  }
  height.value = Math.min(root.scrollHeight, FIT_MAX_HEIGHT_PX);
  measuredHeights.set(srcdoc.value, height.value);
  const oldest = measuredHeights.keys().next().value;
  if (measuredHeights.size > 200 && oldest !== undefined) {
    measuredHeights.delete(oldest);
  }
};

const onLoad = (event: Event) => {
  if (props.fitContent !== true) {
    return;
  }
  const frame = event.target as HTMLIFrameElement;
  observer?.disconnect();
  measure(frame);
  const body = frame.contentDocument?.body;
  if (body !== undefined && body !== null) {
    observer = new ResizeObserver(() => measure(frame));
    observer.observe(body);
  }
};

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <iframe
    :srcdoc="srcdoc"
    :sandbox="sandbox"
    referrerpolicy="no-referrer"
    title="Message content"
    class="block w-full border-0 bg-white"
    :class="fitContent ? '' : 'h-full'"
    :style="fitContent ? { height: `${height ?? 120}px` } : undefined"
    @load="onLoad"
  />
</template>
