import { getAutumnEnv } from "@autumn/env";
import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();
getAutumnEnv();
await import("./main.js");
const embedEve =
	process.env.EVE_EMBEDDED ??
	(process.env.NODE_ENV === "production" ? "1" : "0");
if (embedEve === "1") {
	const { startEmbeddedEveServer } = await import(
		"./internal/agentRuntime/eve/embeddedServer.js"
	);
	const { logger } = await import("./lib/logger.js");
	startEmbeddedEveServer().catch(async (error) => {
		logger.error("Embedded eve server failed to start", error, {
			event: "leaf.eve_process_start_failed",
		});
		await logger.flush?.();
		process.exit(1);
	});
}
