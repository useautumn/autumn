import type { Command } from "../client/types/command.js";
import { createLedgerApp } from "./http/createLedgerApp.js";
import { getShard, stopShards } from "./internal/shard/getShard.js";
import { resolveShardId } from "./internal/shard/resolveShardId.js";
import type { Shard } from "./internal/shard/types/shard.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";

const resolveShard = ({ command }: { command: Command }): Shard =>
	getShard({ id: resolveShardId({ command }) });

const server = Bun.serve({
	fetch: createLedgerApp({ resolveShard }).fetch,
	hostname: "0.0.0.0",
	port: env.LEDGER_PORT,
});

logger.info("Ledger listening", {
	event: "ledger.server_started",
	data: { host: `${server.hostname}:${server.port}` },
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void (async () => {
			logger.info("Ledger shutting down", {
				event: "ledger.server_stopping",
				data: { signal },
			});
			await server.stop();
			await stopShards();
			await logger.flush?.().catch(() => undefined);
			process.exit(signal === "SIGTERM" ? 143 : 130);
		})();
	});
}
