<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCanEditResponses } from "@/composables";
import { useInstanceDetailLogic } from "@/pages/InstanceDetail/useLogic";
import { Workspace } from "./components/Workspace";

const route = useRoute();
const router = useRouter();
const instanceId = computed(() => route.params.id as string);

const { instance, isLoadingInstance, logs } =
  useInstanceDetailLogic(instanceId);
const canEdit = useCanEditResponses(instance);

watch(
  [instance, isLoadingInstance, canEdit],
  ([current, loading, editable]) => {
    if (current !== undefined && !loading && !editable) {
      router.replace({ name: "instanceDetail", params: { id: current.id } });
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="h-full overflow-hidden p-2 pt-0">
    <Workspace
      v-if="instance && !isLoadingInstance && canEdit"
      :key="instance.id"
      :instance="instance"
      :logs="logs"
    />
    <div v-else class="flex h-full w-full items-center justify-center">
      <i class="pi pi-spinner pi-spin text-4xl text-surface-400" />
    </div>
  </div>
</template>
