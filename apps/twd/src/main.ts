import { websocket } from "hono/bun";
import { runMigrations } from "./db/migrate.ts";
import { createApp } from "./http/createApp.ts";
import { startJobRunner } from "./internal/jobs/runner/jobRunner.ts";
import { preloadKeySecrets } from "./internal/keys/actions/resolveKeySecret.ts";
import { startPgChangeListener } from "./internal/live/pgChanges/startPgChangeListener.ts";
import { createContext, SYSTEM_ACTOR } from "./lib/createContext.ts";
import { getTwdEnv } from "./lib/env.ts";
import { getLogger } from "./lib/logger.ts";
import { startSweepers } from "./lib/startSweepers.ts";

const env = getTwdEnv();
const logger = getLogger();

await runMigrations();
logger.info("key secrets preloaded", {
	keys: await preloadKeySecrets({
		ctx: createContext({ actor: SYSTEM_ACTOR }),
	}),
});

const app = createApp();
const server = Bun.serve({
	port: env.TWD_PORT,
	fetch: app.fetch,
	idleTimeout: 0,
	websocket,
});
logger.info("twd listening", { port: env.TWD_PORT });

const runner = startJobRunner();
const stopPgChanges = await startPgChangeListener();
const stopSweepers = startSweepers();

let shuttingDown = false;
const shutdown = async (signal: string) => {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info("twd shutting down", { signal });
	stopSweepers();
	await stopPgChanges();
	await runner.stop();
	await server.stop(true);
	process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
