import { defineStore } from "pinia";
import { type Config, ConfigSchema } from "shared";
import { computed, ref } from "vue";
import { configApi } from "@/api/domains/config";

export const useConfigStore = defineStore("config", () => {
  const config = ref<Config | undefined>(undefined);
  const isLoading = ref(false);
  const isInitialized = ref(false);

  const agentsModel = ref("google/gemini-3-flash-preview");

  const fetchConfig = async () => {
    if (isInitialized.value) {
      return;
    }

    isLoading.value = true;

    try {
      const data = await configApi.get();
      const parsed = ConfigSchema.safeParse(data);

      if (!parsed.success) {
        console.error("Config validation error:", parsed.error);
        return;
      }

      config.value = parsed.data;
    } catch (err) {
      console.error("Fetch config error:", err);
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  };

  return {
    config: computed(() => config.value),
    isLoading: computed(() => isLoading.value),
    isInitialized: computed(() => isInitialized.value),
    fetchConfig,
    agentsModel,
  };
});
