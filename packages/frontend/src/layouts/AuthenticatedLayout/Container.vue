<script setup lang="ts">
import Button from "primevue/button";
import Menu from "primevue/menu";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import { CommandPalette } from "@/components/CommandPalette";
import { config } from "@/config";

const authStore = useAuthStore();
const router = useRouter();
const menu = ref();

const items = ref([
  {
    label: "Logout",
    icon: "pi pi-sign-out",
    command: () => {
      authStore.logout();
    },
  },
]);

const toggle = (event: Event) => {
  menu.value.toggle(event);
};

const goHome = (event: MouseEvent) => {
  if (event.button === 1 || event.ctrlKey || event.metaKey) {
    const route = router.resolve({ name: "home" });
    window.open(route.href, "_blank");
  } else {
    router.push({ name: "home" });
  }
};
</script>

<template>
  <CommandPalette />
  <div class="h-screen flex flex-col bg-surface-800">
    <nav class="bg-surface-800 shrink-0">
      <div class="mx-auto px-6">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <button
              @click="goHome"
              @auxclick="goHome"
              class="flex items-center gap-2 text-xl text-surface-0 hover:text-primary transition-colors font-mono cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-6 h-6"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" x2="20" y1="19" y2="19" />
              </svg>
              httpworkbench
              <span
                class="ml-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-primary/20 text-primary rounded"
              >
                beta v{{ config.version }}
              </span>
            </button>
          </div>

          <div class="flex items-center gap-2">
            <a
              href="https://github.com/bebiksior/httpworkbench"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center text-surface-400 hover:text-surface-200 transition-colors"
              aria-label="GitHub"
            >
              <i class="pi pi-github text-xl" />
            </a>
            <span
              v-if="authStore.user"
              class="text-sm text-surface-400 hidden sm:inline"
            >
              {{ authStore.user.googleId }}
            </span>
            <Button
              type="button"
              icon="pi pi-user"
              rounded
              text
              aria-label="User"
              @mousedown="toggle"
            />
            <Menu ref="menu" :model="items" popup />
          </div>
        </div>
      </div>
    </nav>

    <main class="flex-1 min-h-0">
      <router-view />
    </main>
  </div>
</template>
