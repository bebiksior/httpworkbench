import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const AuthenticatedLayout = () =>
  import("@/layouts/AuthenticatedLayout/Container.vue");
const Home = () => import("@/pages/Home/Container.vue");
const InstanceDetail = () => import("@/pages/InstanceDetail/Container.vue");
const Login = () => import("@/pages/Login/Container.vue");
const NotFound = () => import("@/pages/NotFound/Container.vue");
const Settings = () => import("@/pages/Settings/Container.vue");
const PoCBuilder = () => import("@/pages/PoCBuilder/Container.vue");

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
      children: [
        {
          path: "",
          name: "home",
          component: Home,
          meta: { requiresSession: true },
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
          meta: { requiresSession: true },
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
