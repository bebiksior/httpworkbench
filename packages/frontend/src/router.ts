import { createRouter, createWebHistory } from "vue-router";
import { config } from "@/config";
import { loadInstanceDetailPage } from "@/pages/InstanceDetail/load";
import { useAuthStore } from "@/stores/auth";

const AuthenticatedLayout = () =>
  import("@/layouts/AuthenticatedLayout").then(
    (module) => module.AuthenticatedLayout,
  );
const Home = () => import("@/pages/Home").then((module) => module.Home);
const Login = () => import("@/pages/Login").then((module) => module.Login);
const NotFound = () =>
  import("@/pages/NotFound").then((module) => module.NotFound);
const Settings = () =>
  import("@/pages/Settings").then((module) => module.Settings);
const PoCBuilder = () =>
  import("@/pages/PoCBuilder").then((module) => module.PoCBuilder);
const InstanceResponses = () =>
  import("@/pages/InstanceResponses").then(
    (module) => module.InstanceResponses,
  );

const Mailboxes = () =>
  import("@/pages/Mailboxes").then((module) => module.Mailboxes);
const Mailbox = () =>
  import("@/pages/Mailbox").then((module) => module.Mailbox);

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
          component: loadInstanceDetailPage,
        },
        {
          path: "instances/:id/builder",
          name: "pocBuilder",
          component: PoCBuilder,
          meta: { requiresSession: true },
        },
        {
          path: "mail",
          name: "mailboxes",
          component: Mailboxes,
          meta: { requiresUser: true, requiresMail: true },
        },
        {
          path: "mail/:id",
          name: "mailbox",
          component: Mailbox,
          meta: { requiresUser: true, requiresMail: true },
        },
        {
          path: "instances/:id/responses",
          name: "instanceResponses",
          component: InstanceResponses,
          meta: { requiresUser: true },
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
  if (
    !config.smtpEnabled &&
    to.matched.some((record) => record.meta?.requiresMail === true)
  ) {
    return { name: "home" };
  }

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
