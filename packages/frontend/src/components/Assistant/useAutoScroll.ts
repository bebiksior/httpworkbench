import { nextTick, type Ref, watch } from "vue";

export const useAutoScroll = (
  container: Ref<HTMLElement | undefined>,
  triggers: unknown[],
  options: { smooth?: boolean; always?: boolean } = {},
) => {
  const scrollToBottom = () => {
    if (container.value === undefined || container.value === null) return;

    const { scrollHeight, clientHeight } = container.value;
    const behavior = options.smooth === true ? "smooth" : "auto";

    container.value.scrollTo({
      top: scrollHeight - clientHeight,
      behavior,
    });
  };

  watch(
    triggers,
    async () => {
      await nextTick();
      scrollToBottom();
    },
    { deep: true, immediate: true },
  );

  return { scrollToBottom };
};
