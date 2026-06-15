<script setup lang="ts">
import Button from "primevue/button";
import Menu from "primevue/menu";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import { useThemeStore } from "../../stores/theme";
import { CommandPalette } from "@/components/CommandPalette";
import { UserNoticeDialog } from "@/components/UserNoticeDialog";
import { config } from "@/config";

const authStore = useAuthStore();
const themeStore = useThemeStore();
const router = useRouter();
const menu = ref();

const goSettings = () => {
  void router.push({ name: "settings" });
};

const accountLabel = computed(() => {
  if (authStore.user) {
    return authStore.user.googleId;
  }
  if (authStore.isGuest) {
    return "Guest session";
  }
  return undefined;
});

const menuItems = computed(() => {
  const sessionItems = authStore.hasSession
    ? [
        {
          label: "Settings",
          icon: "pi pi-cog",
          command: goSettings,
        },
      ]
    : [];

  const linkItems = [
    {
      label: "API Docs",
      icon: "pi pi-book",
      url: "/docs",
      target: "_blank",
    },
    {
      label: "GitHub",
      icon: "pi pi-github",
      url: "https://github.com/bebiksior/httpworkbench",
      target: "_blank",
    },
  ];

  const logoutItems = authStore.hasSession
    ? [
        { separator: true },
        {
          label: authStore.isGuest ? "Exit Guest Mode" : "Logout",
          icon: "pi pi-sign-out",
          command: () => {
            authStore.logout();
          },
        },
      ]
    : [];

  return [...sessionItems, ...linkItems, ...logoutItems];
});

const toggleMenu = (event: Event) => {
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

const goLogin = () => {
  router.push({ name: "login" });
};
</script>

<template>
  <UserNoticeDialog />
  <CommandPalette v-if="authStore.hasSession" />
  <div class="h-screen flex flex-col bg-surface-0 dark:bg-surface-800">
    <nav class="bg-surface-0 dark:bg-surface-800 shrink-0">
      <div class="mx-auto px-3 sm:px-6">
        <div class="flex justify-between h-16">
          <div class="flex min-w-0 items-center">
            <button
              @click="goHome"
              @auxclick="goHome"
              class="flex min-w-0 items-center gap-1.5 text-lg text-surface-900 dark:text-surface-0 hover:text-primary transition-colors font-mono cursor-pointer sm:gap-2 sm:text-xl"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
              >
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" x2="20" y1="19" y2="19" />
              </svg>
              <span class="min-w-0 truncate">httpworkbench</span>
              <span
                class="ml-0.5 shrink-0 whitespace-nowrap rounded bg-primary/20 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary sm:ml-2 sm:px-1.5"
                :title="`Beta v${config.version}`"
              >
                <span class="hidden sm:inline">beta </span>v{{ config.version }}
              </span>
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              :icon="themeStore.mode === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"
              rounded
              text
              :aria-label="
                themeStore.mode === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              "
              @click="themeStore.toggle"
            />

            <Button
              v-if="!authStore.hasSession"
              type="button"
              label="Login"
              icon="pi pi-sign-in"
              outlined
              size="small"
              @click="goLogin"
            />

            <Button
              type="button"
              icon="pi pi-bars"
              rounded
              text
              aria-label="Menu"
              aria-haspopup="true"
              @click="toggleMenu"
            />
            <Menu ref="menu" :model="menuItems" popup>
              <template #start>
                <div
                  v-if="accountLabel !== undefined"
                  class="border-b border-surface-200 px-3 py-2.5 dark:border-surface-700"
                >
                  <p
                    class="max-w-[220px] truncate text-sm text-surface-600 dark:text-surface-400"
                    :title="accountLabel"
                  >
                    {{ accountLabel }}
                  </p>
                </div>
              </template>
            </Menu>
          </div>
        </div>
      </div>
    </nav>

    <main class="flex-1 min-h-0">
      <router-view />
    </main>
  </div>
</template>
