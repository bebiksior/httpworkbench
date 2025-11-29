import { ref, onMounted } from "vue";
import { compare } from "compare-versions";
import { z } from "zod";
import { config } from "@/config";

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  published_at: z.string(),
});

type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "update-available"; release: GitHubRelease }
  | { status: "error"; message: string };

export const useUpdateCheck = () => {
  const state = ref<UpdateState>({ status: "idle" });

  const checkForUpdates = async () => {
    state.value = { status: "checking" };

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.githubRepo}/releases/latest`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          state.value = { status: "up-to-date" };
          return;
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const rawData = await response.json();
      const release = GitHubReleaseSchema.parse(rawData);
      const remoteVersion = release.tag_name.replace(/^v/, "");

      if (compare(remoteVersion, config.version, ">")) {
        state.value = { status: "update-available", release };
      } else {
        state.value = { status: "up-to-date" };
      }
    } catch (error) {
      state.value = {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to check for updates",
      };
    }
  };

  onMounted(() => {
    checkForUpdates();
  });

  return {
    state,
    checkForUpdates,
  };
};
