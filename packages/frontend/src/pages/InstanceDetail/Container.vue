<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { useInstanceDetailLogic } from "./useLogic";
import { InstanceData } from "./components/InstanceData";
import { InstanceLog } from "./components/InstanceLog";

const route = useRoute();
const instanceId = computed(() => route.params.id as string);

const { instance, logs, isLoading } = useInstanceDetailLogic(instanceId);
</script>

<template>
  <div
    class="flex flex-col lg:flex-row h-full overflow-hidden gap-1.5 p-2 pt-0"
  >
    <div
      class="rounded-lg w-full lg:w-[50%] xl:w-[35%] lg:min-w-[350px] bg-white dark:bg-surface-900 p-6 overflow-y-auto flex flex-col gap-6 max-h-[40vh] lg:max-h-full shrink-0"
    >
      <div v-if="isLoading" class="flex justify-center py-10">
        <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
      </div>

      <InstanceData v-else-if="instance" :instance="instance" />

      <div v-else class="text-center text-surface-500 mt-10">
        Instance not found
      </div>
    </div>

    <div
      class="w-full lg:w-[50%] xl:w-[65%] flex flex-col bg-surface-50 dark:bg-surface-900 flex-1 min-h-0 rounded-lg"
    >
      <div class="h-14 px-6 flex items-center justify-between shrink-0">
        <h2 class="font-semibold text-surface-900 dark:text-surface-0">Logs</h2>
        <span class="text-sm text-surface-500">{{ logs.length }} events</span>
      </div>

      <div class="flex-1 min-h-0 relative overflow-hidden">
        <div
          v-if="logs.length === 0"
          class="text-center text-surface-500 py-12"
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
          class="h-full px-6 py-6 pt-2"
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
</template>
