<script setup lang="ts">
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { computed, toRefs } from "vue";

const props = defineProps<{ content: string }>();
const { content } = toRefs(props);

const md = new MarkdownIt({
  breaks: true,
  linkify: false,
});

const rendered = computed(() => {
  const rendered = md.render(content.value);
  return DOMPurify.sanitize(rendered);
});
</script>

<!-- eslint-disable vue/no-v-html -->

<template>
  <div
    class="prose prose-compact dark:prose-invert wrap-break-word select-text font-mono max-w-none"
    v-html="rendered"
  ></div>
</template>

<style>
.prose ul {
  list-style-type: disc;
  padding-left: 1.625em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.prose ol {
  list-style-type: decimal;
  padding-left: 1.625em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.prose li {
  margin-top: 0.25em;
  margin-bottom: 0.25em;
}

.prose p {
  margin-top: 0.75em;
  margin-bottom: 0.75em;
  line-height: 1.6;
}

.prose p:first-child {
  margin-top: 0;
}

.prose p:last-child {
  margin-bottom: 0;
}

.prose h1,
.prose h2,
.prose h3,
.prose h4 {
  color: var(--surface-100);
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.prose h1 {
  font-size: 1.5em;
}
.prose h2 {
  font-size: 1.25em;
}
.prose h3 {
  font-size: 1.125em;
}

.prose pre {
  background-color: var(--surface-900);
  padding: 0.75em;
  border-radius: 0.375rem;
  overflow-x: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 0.75em;
  margin-bottom: 0.75em;
  border: 1px solid var(--surface-800);
}

.prose code {
  background-color: var(--surface-800);
  padding: 0.125em 0.375em;
  border-radius: 0.25rem;
  font-size: 0.875em;
}

.prose pre code {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 100%;
  color: inherit;
}

.prose blockquote {
  border-left: 4px solid var(--surface-700);
  padding-left: 1em;
  font-style: italic;
  color: var(--surface-400);
  margin-top: 1em;
  margin-bottom: 1em;
}

.prose a {
  color: var(--primary-400);
  text-decoration: underline;
}
</style>
