<script setup lang="ts">
import Button from "primevue/button";
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { useInstanceDetailLogic } from "./useLogic";
import { useSidePanel } from "./useSidePanel";
import { InstanceData } from "./components/InstanceData";
import { InstanceLog } from "./components/InstanceLog";

const route = useRoute();
const instanceId = computed(() => route.params.id as string);
const { instance, logs, isLoading } = useInstanceDetailLogic(instanceId);
const {
  isHidden: isSidePanelHidden,
  isTransitioning: isSidePanelTransitioning,
  setHidden: setSidePanelHidden,
} = useSidePanel();

const viewQuery = computed(() => {
  const raw = route.query.view;
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
});

watch(
  viewQuery,
  (view) => {
    if (view === "logs") {
      setSidePanelHidden(true);
    } else {
      setSidePanelHidden(false);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex flex-col lg:flex-row h-full overflow-hidden p-2 pt-0 transition-[gap] duration-[220ms] ease-out"
    :class="isSidePanelHidden ? 'gap-0' : 'gap-1.5'"
  >
    <div
      class="instance-detail-side-panel rounded-lg w-full lg:w-[50%] xl:w-[35%] lg:min-w-[350px] bg-white dark:bg-surface-900 overflow-y-auto max-h-[40vh] lg:max-h-full shrink-0"
      :class="{
        'instance-detail-side-panel-hidden': isSidePanelHidden,
        'instance-detail-side-panel-transitioning': isSidePanelTransitioning,
      }"
      :aria-hidden="isSidePanelHidden"
    >
      <div
        class="instance-detail-side-panel-content flex h-full min-h-0 flex-col"
      >
        <div
          v-if="isLoading"
          class="flex flex-1 items-center justify-center px-6 py-10"
        >
          <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
        </div>

        <InstanceData
          v-else-if="instance"
          :instance="instance"
          @hide-panel="setSidePanelHidden(true)"
        />

        <div
          v-else
          class="flex flex-1 items-center justify-center px-6 py-10 text-center text-surface-500"
        >
          Instance not found
        </div>
      </div>
    </div>

    <div
      class="w-full lg:w-[50%] xl:w-[65%] flex flex-col bg-surface-50 dark:bg-surface-900 flex-1 min-h-0 rounded-lg"
    >
      <div class="flex flex-1 min-h-0 flex-col p-4">
        <div class="flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2">
            <i
              class="pi pi-list text-sm text-surface-500 dark:text-surface-400"
              aria-hidden="true"
            />
            <h2 class="font-semibold text-surface-900 dark:text-surface-0">
              Logs
            </h2>
            <Button
              v-if="isSidePanelHidden"
              severity="secondary"
              text
              rounded
              size="small"
              class="shrink-0"
              aria-label="Show details panel"
              title="Show details"
              @click="setSidePanelHidden(false)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect
                  x="2.25"
                  y="3.25"
                  width="15.5"
                  height="13.5"
                  rx="2"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M7 3.25V16.75"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M9.75 10H12.75"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <path
                  d="M11.25 8.5L12.75 10L11.25 11.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-surface-500"
              >{{ logs.length }} events</span
            >
          </div>
        </div>

        <div class="relative mt-4 flex-1 min-h-0 overflow-hidden">
          <div
            v-if="logs.length === 0"
            class="flex h-full flex-col items-center justify-center text-center text-surface-500"
          >
            <i class="pi pi-inbox text-4xl mb-2 block"></i>
            Waiting for requests...
          </div>

          <DynamicScroller
            v-else
            :items="logs"
            :min-item-size="200"
            :buffer="400"
            key-field="id"
            class="h-full"
          >
            <template #default="{ item, index, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :data-index="index"
                :size-dependencies="[item.id]"
                class="pb-4"
              >
                <InstanceLog :log="item" />
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.instance-detail-side-panel {
  transition:
    max-width 220ms ease,
    min-width 220ms ease,
    max-height 220ms ease,
    border-color 180ms ease;
}

.instance-detail-side-panel-content {
  min-height: 100%;
}

@media (min-width: 1024px) {
  .instance-detail-side-panel-content {
    transition: transform 220ms ease;
  }

  .instance-detail-side-panel-transitioning {
    overflow: hidden !important;
  }

  .instance-detail-side-panel-transitioning
    .instance-detail-side-panel-content {
    min-width: max-content;
  }
}

@media (min-width: 1024px) {
  .instance-detail-side-panel-hidden {
    width: 0 !important;
    flex-basis: 0 !important;
    max-width: 0 !important;
    min-width: 0 !important;
    overflow: hidden;
    pointer-events: none;
    border-color: transparent;
  }

  .instance-detail-side-panel-hidden .instance-detail-side-panel-content {
    transform: translateX(-20px);
  }
}

@media (max-width: 1023px) {
  .instance-detail-side-panel-hidden {
    max-height: 0 !important;
    padding: 0 !important;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    transform: translateY(-12px);
    border-color: transparent;
  }
}
</style>
