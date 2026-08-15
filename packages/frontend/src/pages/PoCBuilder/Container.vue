<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { useRouter } from "vue-router";
import { useMagicKeys } from "@vueuse/core";
import { useConfirm } from "primevue/useconfirm";
import { storeToRefs } from "pinia";
import { useBuilderStore, useAgentsStore } from "@/stores";
import { ThreePanelLayout, TwoPanelLayout, MobileLayout } from "./layouts";
import { createLeaveGuard } from "./exitBuilder";
import { provideBuilderPage, useBuilderPage } from "./useBuilderPage";

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const instanceId = computed(() => route.params.id as string);

const builderStore = useBuilderStore();
const agentsStore = useAgentsStore();
const { showPreview } = storeToRefs(builderStore);

watch(
  instanceId,
  (id) => {
    agentsStore.setActiveInstance(id);
  },
  { immediate: true },
);

const builderPage = useBuilderPage(instanceId);
provideBuilderPage(builderPage);
const { instance, isLoading, isAiEnabled, handleSave } = builderPage;

const isLargeScreen = ref(false);
const mediaQuery = window.matchMedia("(min-width: 1024px)");

const updateScreenSize = () => {
  isLargeScreen.value = mediaQuery.matches;
};

const keys = useMagicKeys({
  passive: false,
  onEventFired: (e) => {
    if (
      e.type !== "keydown" ||
      (!e.metaKey && !e.ctrlKey) ||
      e.altKey ||
      e.shiftKey
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    if (key === "s") {
      e.preventDefault();
      return;
    }

    if (key === "i" && isAiEnabled.value) {
      e.preventDefault();

      if (!e.repeat) {
        builderStore.toggleAssistant();
      }
    }
  },
});
const cmdS = keys["Meta+s"];
const ctrlS = keys["Control+s"];

watch([cmdS, ctrlS], ([meta, ctrl]) => {
  if ((meta || ctrl) && builderStore.isDirty) {
    handleSave();
  }
});

onMounted(() => {
  updateScreenSize();
  mediaQuery.addEventListener("change", updateScreenSize);
});

onUnmounted(() => {
  mediaQuery.removeEventListener("change", updateScreenSize);
  agentsStore.clearActiveInstance();
  builderStore.reset();
});

const leaveGuard = createLeaveGuard({
  isDirty: () => builderStore.isDirty,
  markClean: () => {
    builderStore.isDirty = false;
  },
  confirmLeave: (accept) => {
    confirm.require({
      message: "You have unsaved changes. Are you sure you want to leave?",
      header: "Unsaved Changes",
      icon: "pi pi-exclamation-triangle",
      rejectProps: {
        label: "Cancel",
        severity: "secondary",
        outlined: true,
      },
      acceptProps: {
        label: "Leave",
        severity: "danger",
      },
      accept,
    });
  },
  navigate: (target) => {
    router.push(target);
  },
});

onBeforeRouteLeave((to, _from, next) => {
  leaveGuard(to, next);
});
</script>

<template>
  <div class="h-full overflow-hidden p-2 pt-0">
    <div
      v-if="isLoading"
      class="w-full h-full flex items-center justify-center"
    >
      <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
    </div>

    <template v-else-if="instance">
      <ThreePanelLayout v-if="isLargeScreen && showPreview" />

      <TwoPanelLayout v-else-if="isLargeScreen" />

      <MobileLayout v-else />
    </template>
  </div>
</template>
