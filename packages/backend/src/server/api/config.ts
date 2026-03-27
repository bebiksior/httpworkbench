import { appConfig } from "../../config";

export const CONFIG_ROUTES = {
  "/api/config": {
    GET: async () => {
      return new Response(JSON.stringify(appConfig), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
  },
};
