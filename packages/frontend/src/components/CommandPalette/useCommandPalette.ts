import { onKeyStroke } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { InstanceSummary } from "shared";
import { useInstances } from "@/queries/domains/useInstances";

export const filterCommandInstances = (
  instances: readonly InstanceSummary[],
  query: string,
) => {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return [...instances];
  }
  return instances.filter((instance) =>
    `${instance.id}\n${instance.label ?? ""}`
      .toLowerCase()
      .includes(normalized),
  );
};

export const moveCommandSelection = (
  current: number,
  length: number,
  direction: 1 | -1,
) => {
  if (length === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
};

export const useCommandPalette = () => {
  const router = useRouter();
  const visible = ref(false);
  const query = ref("");
  const activeIndex = ref(0);
  const { data: instances } = useInstances({ enabled: visible });
  const filteredInstances = computed(() =>
    filterCommandInstances(instances.value ?? [], query.value),
  );

  onKeyStroke("k", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.repeat) {
      event.preventDefault();
      visible.value = !visible.value;
    }
  });

  watch(visible, (isVisible) => {
    if (!isVisible) return;
    query.value = "";
    activeIndex.value = filteredInstances.value.length > 0 ? 0 : -1;
  });

  watch(filteredInstances, (list) => {
    if (list.length === 0) {
      activeIndex.value = -1;
    } else if (activeIndex.value < 0 || activeIndex.value >= list.length) {
      activeIndex.value = 0;
    }
  });

  onKeyStroke("Escape", () => {
    if (visible.value) {
      visible.value = false;
    }
  });

  const handleSelect = async (instance: InstanceSummary) => {
    await router.push({
      name: "instanceDetail",
      params: { id: instance.id },
    });
    visible.value = false;
  };

  const handleInputKeydown = async (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex.value = moveCommandSelection(
        activeIndex.value,
        filteredInstances.value.length,
        event.key === "ArrowDown" ? 1 : -1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredInstances.value[activeIndex.value];
      if (selected !== undefined) {
        await handleSelect(selected);
      }
    }
  };

  const getInstanceLabel = (instance: InstanceSummary) =>
    instance.label !== undefined && instance.label !== ""
      ? instance.label
      : instance.id;

  return {
    visible,
    query,
    activeIndex,
    filteredInstances,
    handleSelect,
    handleInputKeydown,
    getInstanceLabel,
  };
};
