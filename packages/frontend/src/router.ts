import { createRouter, createWebHistory } from "vue-router";
import { AuthenticatedLayout } from "@/layouts/AuthenticatedLayout";
import { Home } from "@/pages/Home";
import { InstanceDetail } from "@/pages/InstanceDetail";
import { Login } from "@/pages/Login";
import { NotFound } from "@/pages/NotFound";
import { Settings } from "@/pages/Settings";
import { PoCBuilder } from "@/pages/PoCBuilder";
import { useAuthStore, useConfigStore } from "@/stores";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: Login,
      meta: { requiresGuest: true },
    },
    {
      path: "/",
      component: AuthenticatedLayout,
      meta: { requiresSession: true },
      children: [
        {
          path: "",
          name: "home",
          component: Home,
        },
        {
          path: "settings",
          name: "settings",
          component: Settings,
          meta: { requiresUser: true },
        },
        {
          path: "instances/:id",
          name: "instanceDetail",
          component: InstanceDetail,
        },
        {
          path: "instances/:id/builder",
          name: "pocBuilder",
          component: PoCBuilder,
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      name: "notFound",
      component: NotFound,
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const configStore = useConfigStore();

  if (!configStore.isInitialized) {
    await configStore.fetchConfig();
  }

  if (!authStore.isInitialized) {
    await authStore.fetchUser();
  }

  const requiresSession = to.matched.some(
    (record) => record.meta?.requiresSession === true,
  );
  const requiresUser = to.matched.some(
    (record) => record.meta?.requiresUser === true,
  );
  const requiresGuest = to.matched.some(
    (record) => record.meta?.requiresGuest === true,
  );

  if (requiresUser && !authStore.isAuthenticated) {
    return { name: "login" };
  }

  if (requiresSession && !authStore.hasSession) {
    return { name: "login" };
  }

  if (requiresGuest && authStore.hasSession) {
    return { name: "home" };
  }
});

export default router;
