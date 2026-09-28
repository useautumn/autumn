import { createApp } from "./http/createApp.ts";
import { getTwdEnv } from "./lib/env.ts";
import { getLogger } from "./lib/logger.ts";

const env = getTwdEnv();
const app = createApp();

Bun.serve({ port: env.TWD_PORT, fetch: app.fetch, idleTimeout: 0 });
getLogger().info("twd listening", { port: env.TWD_PORT });
// The jobs task starts the job runner here.
