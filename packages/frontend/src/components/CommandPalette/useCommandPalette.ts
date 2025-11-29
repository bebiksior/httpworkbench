import { useMagicKeys, onKeyStroke } from "@vueuse/core";
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import type { Instance } from "shared";
import { useInstances } from "@/queries/domains/useInstances";

export const useCommandPalette = () => {
  const router = useRouter();
  const visible = ref(false);
  const { data: instances } = useInstances();

  const keys = useMagicKeys();
  const cmdK = keys["Meta+k"];
  const ctrlK = keys["Control+k"];

  watch([cmdK, ctrlK], ([meta, ctrl]) => {
    if (meta || ctrl) {
      visible.value = !visible.value;
    }
  });

  onKeyStroke("Escape", () => {
    if (visible.value) {
      visible.value = false;
    }
  });

  const handleMaskClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute("command-dialog-mask")) {
      visible.value = false;
    }
  };

  onMounted(() => {
    document.addEventListener("click", handleMaskClick);
  });

  onUnmounted(() => {
    document.removeEventListener("click", handleMaskClick);
  });

  const handleSelect = (item: { value: string }) => {
    const list = instances.value ?? [];
    const instance = list.find((i) => i.id === item.value);
    if (instance !== undefined) {
      router.push({ name: "instanceDetail", params: { id: instance.id } });
      visible.value = false;
    }
  };

  const getInstanceLabel = (instance: Instance) => {
    if (instance.label !== undefined && instance.label !== "") {
      return instance.label;
    }
    return instance.id;
  };

  return {
    visible,
    instances,
    handleSelect,
    getInstanceLabel,
  };
};
