import { defineStore } from "pinia";
import { type User, UserSchema } from "shared";
import { computed, ref } from "vue";
import { apiClient } from "@/api/client";
import { ApiError, UnauthorizedError, ValidationError } from "@/api/errors";
import { parseResponse } from "@/api/parseResponse";
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
      const data = await apiClient.get<unknown>("/api/user");
      setUser(parseResponse(UserSchema, data, "user"));
    } catch (err) {
      setUser(undefined);
      if (err instanceof UnauthorizedError) {
        return;
      }
      error.value = {
        message: getErrorMessage(err),
        code:
          err instanceof ValidationError
            ? "VALIDATION_ERROR"
            : err instanceof ApiError
              ? "UNKNOWN"
              : "NETWORK_ERROR",
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

  const signInWithApiKey = async (apiKey: string) => {
    clearError();
    isLoading.value = true;

    try {
      const data = await apiClient.post<unknown>("/api/auth/api-key", {
        apiKey,
      });
      const parsedUser = parseResponse(UserSchema, data, "user");

      clearGuestSession();
      setUser(parsedUser);
      isInitialized.value = true;
      return true;
    } catch (err) {
      setUser(undefined);
      error.value = {
        message:
          err instanceof UnauthorizedError
            ? "Invalid API key"
            : getErrorMessage(err),
        code:
          err instanceof UnauthorizedError
            ? "UNAUTHORIZED"
            : err instanceof ValidationError
              ? "VALIDATION_ERROR"
              : err instanceof ApiError
                ? "UNKNOWN"
                : "NETWORK_ERROR",
      };
      console.error("API key sign-in error:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
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
      await apiClient.post<void>("/api/auth/logout");

      setUser(undefined);
      window.location.href = "/login";
    } catch (err) {
      error.value = {
        message: getErrorMessage(err),
        code: err instanceof ApiError ? "UNKNOWN" : "NETWORK_ERROR",
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
    signInWithApiKey,
    signInAsGuest,
    logout,
    fetchUser,
    clearError,
  };
});
