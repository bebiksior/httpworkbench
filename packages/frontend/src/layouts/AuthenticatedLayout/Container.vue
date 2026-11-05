<script setup lang="ts">
import Button from "primevue/button";
import Menu from "primevue/menu";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import { useThemeStore } from "../../stores/theme";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { UserNoticeDialog } from "@/components/UserNoticeDialog";
import { config } from "@/config";

const authStore = useAuthStore();
const themeStore = useThemeStore();
const router = useRouter();
const route = useRoute();
const menu = ref();

const sections = [
  {
    label: "Instances",
    to: "/",
    match: (path: string) => !path.startsWith("/mail"),
  },
  {
    label: "Mail",
    to: "/mail",
    match: (path: string) => path.startsWith("/mail"),
  },
];
const showSections = computed(
  () => config.smtpEnabled && authStore.isAuthenticated,
);
const shortcutsVisible = ref(false);

const goSettings = async () => {
  await router.push({ name: "settings" });
};

const accountLabel = computed(() => {
  if (authStore.user) {
    return authStore.user.googleId ?? "Local account";
  }
  if (authStore.isGuest) {
    return "Guest session";
  }
  return undefined;
});

const menuItems = computed(() => {
  const sessionItems = authStore.isAuthenticated
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
      label: "Keyboard shortcuts",
      icon: "pi pi-question-circle",
      command: () => {
        shortcutsVisible.value = true;
      },
    },
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

const goHome = async (event: MouseEvent) => {
  if (event.button === 1 || event.ctrlKey || event.metaKey) {
    const route = router.resolve({ name: "home" });
    window.open(route.href, "_blank");
  } else {
    await router.push({ name: "home" });
  }
};

const goLogin = async () => {
  await router.push({ name: "login" });
};
</script>

<template>
  <UserNoticeDialog />
  <CommandPalette v-if="authStore.hasSession" />
  <ShortcutsDialog
    v-model:visible="shortcutsVisible"
    :can-search-instances="authStore.hasSession"
  />
  <div class="flex h-dvh flex-col bg-surface-0 dark:bg-surface-800">
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
              <span
                class="min-w-0 truncate"
                :class="{ 'max-sm:hidden': showSections }"
                >httpworkbench</span
              >
            </button>
            <div
              v-if="showSections"
              class="ml-2 flex shrink-0 items-center gap-0.5 sm:ml-6"
              aria-label="Sections"
            >
              <RouterLink
                v-for="section in sections"
                :key="section.to"
                :to="section.to"
                draggable="false"
                :aria-current="section.match(route.path) ? 'page' : undefined"
                class="rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3"
                :class="
                  section.match(route.path)
                    ? 'bg-surface-100 text-surface-900 dark:bg-surface-700/70 dark:text-surface-0'
                    : 'text-surface-500 hover:bg-surface-100/70 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700/40 dark:hover:text-surface-0'
                "
              >
                {{ section.label }}
              </RouterLink>
            </div>
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
            <Menu
              ref="menu"
              :model="menuItems"
              :pt="{ itemLink: { draggable: false } }"
              popup
            >
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
