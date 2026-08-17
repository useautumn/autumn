import { serve } from "@hono/node-server";
import { chatAdapterNames } from "./bot.js";
import { createLeafApp } from "./http/createLeafApp.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const app = createLeafApp();

serve(
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
