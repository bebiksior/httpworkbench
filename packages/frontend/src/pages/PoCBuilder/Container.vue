<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import { useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import ConfirmDialog from "primevue/confirmdialog";
import { storeToRefs } from "pinia";
import { useBuilderStore } from "@/stores";
import { ThreePanelLayout, TwoPanelLayout, MobileLayout } from "./layouts";
import { provideBuilderPage, useBuilderPage } from "./useBuilderPage";

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const instanceId = computed(() => route.params.id as string);

const builderStore = useBuilderStore();
const { showPreview } = storeToRefs(builderStore);

const builderPage = useBuilderPage(instanceId);
provideBuilderPage(builderPage);
const { instance, isLoading } = builderPage;

const isLargeScreen = ref(false);
const mediaQuery = window.matchMedia("(min-width: 1024px)");

const updateScreenSize = () => {
  isLargeScreen.value = mediaQuery.matches;
};

onMounted(() => {
  updateScreenSize();
  mediaQuery.addEventListener("change", updateScreenSize);
});

onUnmounted(() => {
  mediaQuery.removeEventListener("change", updateScreenSize);
  builderStore.reset();
});

onBeforeRouteLeave((to, _from, next) => {
  if (builderStore.isDirty) {
    next(false);
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
      accept: () => {
        builderStore.isDirty = false;
        router.push(to.fullPath);
      },
    });
  } else {
    next();
  }
});
</script>

<template>
  <ConfirmDialog />
  <div class="h-full overflow-hidden p-2 pt-0">
    <div
      v-if="isLoading"
      class="w-full h-full flex items-center justify-center"
    >
      <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
    </div>

    <template v-else-if="instance?.kind === 'static'">
      <ThreePanelLayout v-if="isLargeScreen && showPreview" />

      <TwoPanelLayout v-else-if="isLargeScreen" />

      <MobileLayout v-else />
    </template>

    <div
      v-else
      class="w-full h-full flex items-center justify-center text-center text-surface-500 px-6"
    >
      Builder is available for static instances only.
    </div>
  </div>
</template>
