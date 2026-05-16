import { onBeforeUnmount, ref } from "vue";

const DEFAULT_TRANSITION_DURATION_MS = 260;

export const useSidePanel = (
  transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS,
) => {
  const isHidden = ref(false);
  const isTransitioning = ref(false);
  let transitionTimeout: number | null = null;

  const clearTransitionTimeout = () => {
    if (transitionTimeout === null) {
      return;
    }

    window.clearTimeout(transitionTimeout);
    transitionTimeout = null;
  };

  const queueTransitionCleanup = () => {
    clearTransitionTimeout();

    transitionTimeout = window.setTimeout(() => {
      isTransitioning.value = false;
      transitionTimeout = null;
    }, transitionDurationMs);
  };

  const setHidden = (hidden: boolean) => {
    if (isHidden.value === hidden) {
      return;
    }

    isTransitioning.value = true;
    isHidden.value = hidden;
    queueTransitionCleanup();
  };

  onBeforeUnmount(clearTransitionTimeout);

  return {
    isHidden,
    isTransitioning,
    setHidden,
  };
};
