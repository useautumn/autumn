import type { Command } from "./api/types/command.js";
import { createLedgerApp } from "./http/createLedgerApp.js";
import { findShard, getShard, stopShards } from "./internal/shard/getShard.js";
import { resolveShardId } from "./internal/shard/resolveShardId.js";
import type { Shard } from "./internal/shard/types/shard.js";
import { runStalenessPoll } from "./internal/subjects/staleness/runStalenessPoll.js";
import type { StaleSubject } from "./internal/subjects/staleness/types/stalenessContext.js";
import { subjectToKey } from "./internal/subjects/subjectToKey.js";
import { env } from "./lib/env.js";
import { getJournal } from "./lib/getJournal.js";
import { getPostgres } from "./lib/getPostgres.js";
import { logger } from "./lib/logger.js";

const resolveShard = ({ command }: { command: Command }): Shard =>
	getShard({ id: resolveShardId({ command }) });

const markSubjectStale = ({
	orgId,
	env: subjectEnv,
	customerId,
}: StaleSubject) =>
	findShard({
		id: resolveShardId({
			command: { org_id: orgId, env: subjectEnv, customer_id: customerId },
		}),
	})?.markStale({ key: subjectToKey({ orgId, env: subjectEnv, customerId }) });

const server = Bun.serve({
	fetch: createLedgerApp({
		resolveShard,
		getJournal,
		exposeDebugRoutes: env.NODE_ENV !== "production",
	}).fetch,
	hostname: "0.0.0.0",
	port: env.LEDGER_PORT,
});

const stopStalenessPoll = runStalenessPoll({
	ctx: {
		postgres: getPostgres(),
		logger,
		intervalMs: env.LEDGER_STALENESS_POLL_MS,
	},
	markStale: markSubjectStale,
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
			stopStalenessPoll();
			await server.stop();
			await stopShards();
			await logger.flush?.().catch(() => undefined);
			process.exit(signal === "SIGTERM" ? 143 : 130);
		})();
	});
}
