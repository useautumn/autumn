import { serve } from "@hono/node-server";
import { chatAdapterNames } from "./bot.js";
import { createLeafApp } from "./http/createLeafApp.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const app = createLeafApp();

const server = serve(
	{
		fetch: app.fetch,
		hostname: "0.0.0.0",
		port: env.PORT,
	},
	({ address, port }) => {
		logger.info("Chat listening", {
			event: "leaf.server_started",
			data: {
				host: `${address}:${port}`,
				adapters: chatAdapterNames,
			},
		});
	},
);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void (async () => {
			logger.info("Chat shutting down", {
				event: "leaf.server_stopping",
				data: { signal },
			});
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await logger.flush?.().catch(() => undefined);
			process.exit(signal === "SIGTERM" ? 143 : 130);
		})();
	});
}
