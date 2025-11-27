import { defineStore } from "pinia";
import { type User, UserSchema } from "shared";
import { computed, ref } from "vue";
import { getErrorMessage } from "@/utils/error";
import { useGuestInstancesStore } from "./guestInstances";

const GUEST_SESSION_KEY = "httpworkbench_guest_session";

const readGuestSession = () => {
  try {
    return window.localStorage.getItem(GUEST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

const writeGuestSession = (active: boolean) => {
  try {
    if (active) {
      window.localStorage.setItem(GUEST_SESSION_KEY, "1");
    } else {
      window.localStorage.removeItem(GUEST_SESSION_KEY);
    }
  } catch {}
};

type AuthError = {
  message: string;
  code: "NETWORK_ERROR" | "VALIDATION_ERROR" | "UNAUTHORIZED" | "UNKNOWN";
};

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | undefined>(undefined);
  const isLoading = ref(true);
  const isInitialized = ref(false);
  const error = ref<AuthError | undefined>(undefined);
  const guestSession = ref(readGuestSession());

  const isAuthenticated = computed(() => user.value !== undefined);
  const isGuest = computed(() => guestSession.value);
  const hasSession = computed(
    () => isAuthenticated.value || guestSession.value,
  );

  const guestInstancesStore = useGuestInstancesStore();

  const setUser = (value: User | undefined) => {
    user.value = value;
  };

  const activateGuestSession = () => {
    guestInstancesStore.cleanupExpired();
    guestSession.value = true;
    writeGuestSession(true);
    setUser(undefined);
    isLoading.value = false;
    isInitialized.value = true;
  };

  const clearGuestSession = () => {
    guestSession.value = false;
    writeGuestSession(false);
    guestInstancesStore.reset();
  };

  const clearError = () => {
    error.value = undefined;
  };

  const fetchUser = async () => {
    if (guestSession.value) {
      isLoading.value = false;
      isInitialized.value = true;
      setUser(undefined);
      return;
    }

    isLoading.value = true;
    clearError();

    try {
      const response = await fetch("/api/user", {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(undefined);
        if (response.status === 401) {
          return;
        }
        error.value = {
          message: `Failed to fetch user: ${response.statusText}`,
          code: "UNKNOWN",
        };
        return;
      }

      const data = await response.json();
      const parsed = UserSchema.safeParse(data);

      if (!parsed.success) {
        setUser(undefined);
        error.value = {
          message: "Invalid user data received from server",
          code: "VALIDATION_ERROR",
        };
        console.error("User validation error:", parsed.error);
        return;
      }

      setUser(parsed.data);
    } catch (err) {
      setUser(undefined);
      error.value = {
        message: getErrorMessage(err),
        code: "NETWORK_ERROR",
      };
      console.error("Fetch user error:", err);
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  };

  const signInWithGoogle = () => {
    clearError();
    window.location.href = "/api/auth/google";
  };

  const signInAsGuest = () => {
    clearError();
    activateGuestSession();
  };

  const logout = async () => {
    clearError();

    if (guestSession.value) {
      clearGuestSession();
      window.location.href = "/login";
      return;
    }

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        error.value = {
          message: "Failed to logout",
          code: "UNKNOWN",
        };
        return;
      }

      setUser(undefined);
      window.location.href = "/login";
    } catch (err) {
      error.value = {
        message: getErrorMessage(err),
        code: "NETWORK_ERROR",
      };
      console.error("Logout error:", err);
    }
  };

  return {
    user: computed(() => user.value),
    isAuthenticated,
    isGuest,
    hasSession,
    isLoading: computed(() => isLoading.value),
    isInitialized: computed(() => isInitialized.value),
    error: computed(() => error.value),
    signInWithGoogle,
    signInAsGuest,
    logout,
    fetchUser,
    clearError,
    setUser,
  };
});
