<script setup lang="ts">
import Button from "primevue/button";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { useInstanceDetailLogic } from "./useLogic";
import { useLogsPanelControls } from "./useLogsPanelControls";
import { useSidePanel } from "./useSidePanel";
import { InstanceData } from "./components/InstanceData";
import { InstanceLog } from "./components/InstanceLog";

const route = useRoute();
const instanceId = computed(() => route.params.id as string);
const { instance, logs, showNotFound } = useInstanceDetailLogic(instanceId);
const {
  isHidden: isSidePanelHidden,
  isTransitioning: isSidePanelTransitioning,
  setHidden: setSidePanelHidden,
} = useSidePanel();
const {
  searchQuery,
  filteredLogs,
  eventsLabel,
  isTypeSelected,
  toggleType,
  getFilterButtonClass,
} = useLogsPanelControls(logs, setSidePanelHidden);
</script>

<template>
  <div
    class="flex h-full flex-col overflow-y-auto p-2 pt-0 transition-[gap] duration-[220ms] ease-out lg:flex-row lg:overflow-hidden"
    :class="isSidePanelHidden ? 'gap-0' : 'gap-1.5'"
  >
    <div
      class="instance-detail-side-panel w-full shrink-0 overflow-visible rounded-lg bg-white dark:bg-surface-900 lg:max-h-full lg:w-[50%] lg:min-w-[350px] lg:overflow-y-auto xl:w-[35%]"
      :class="{
        'instance-detail-side-panel-hidden': isSidePanelHidden,
        'instance-detail-side-panel-transitioning': isSidePanelTransitioning,
      }"
      :aria-hidden="isSidePanelHidden"
    >
      <div
        class="instance-detail-side-panel-content flex h-full min-h-0 flex-col"
      >
        <InstanceData
          v-if="instance"
          :instance="instance"
          @hide-panel="setSidePanelHidden(true)"
        />

        <div
          v-else-if="showNotFound"
          class="flex flex-1 items-center justify-center px-6 py-10 text-center text-surface-700 dark:text-surface-400"
        >
          Instance not found
        </div>
      </div>
    </div>

    <div
      class="flex min-h-[65vh] w-full flex-1 flex-col rounded-lg bg-surface-50 dark:bg-surface-900 lg:min-h-0 lg:w-[50%] xl:w-[65%]"
    >
      <div class="flex flex-1 min-h-0 flex-col p-3 sm:p-4">
        <div class="shrink-0">
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <i
                  class="pi pi-list text-sm text-surface-700 dark:text-surface-400"
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
              <span
                class="shrink-0 text-sm text-surface-600 dark:text-surface-400"
              >
                {{ eventsLabel }}
              </span>
            </div>

            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label class="relative block min-w-0 flex-1">
                <i
                  class="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-500 dark:text-surface-400"
                  aria-hidden="true"
                />
                <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search address, method, path, headers, query..."
                  aria-label="Search logs"
                  class="h-9 w-full rounded-lg border border-surface-300 bg-white pl-10 pr-4 text-sm text-surface-900 outline-none ring-0 transition-colors placeholder:text-surface-500 focus:border-surface-400 focus:outline-none focus:ring-0 focus:ring-offset-0 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-0 dark:placeholder:text-surface-400 dark:focus:border-surface-500"
                />
              </label>

              <div
                class="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center"
              >
                <button
                  type="button"
                  :aria-pressed="isTypeSelected('http')"
                  :class="getFilterButtonClass(isTypeSelected('http'))"
                  @click="toggleType('http')"
                >
                  HTTP
                </button>
                <button
                  type="button"
                  :aria-pressed="isTypeSelected('dns')"
                  :class="getFilterButtonClass(isTypeSelected('dns'))"
                  @click="toggleType('dns')"
                >
                  DNS
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="relative mt-4 flex-1 min-h-0 overflow-hidden">
          <div
            v-if="logs.length === 0"
            class="flex h-full flex-col items-center justify-center text-center text-surface-700 dark:text-surface-400"
          >
            <i class="pi pi-inbox text-4xl mb-2 block"></i>
            Waiting for requests...
          </div>

          <div
            v-else-if="filteredLogs.length === 0"
            class="flex h-full flex-col items-center justify-center text-center text-surface-700 dark:text-surface-400"
          >
            <i class="pi pi-search text-4xl mb-2 block"></i>
            No logs match the current search and filters.
          </div>

          <DynamicScroller
            v-else
            :items="filteredLogs"
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
