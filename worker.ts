import { handleRequest } from "./src/server/handler.ts";
import { createD1HealthStore } from "./src/server/storage/d1.ts";

export default {
  async fetch(request, env): Promise<Response> {
    const response = await handleRequest(request, {
      store: createD1HealthStore(env.UOS_HEALTH_CACHE),
      serveAssets: (request) => env.ASSETS.fetch(request),
    });
    const headers = new Headers(response.headers);
    headers.set("x-uos-runtime", "cloudflare-workers");
    headers.set("x-uos-deployment-id", env.UOS_VERSION.id);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
