import { appendFileSync } from "node:fs";
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import { databaseTimings } from "../../../src/logging/databaseTimings.js";

const env = JSON.parse(
	process.env.BALANCE_WORKER_TEST_ENV ?? "null",
) as BalanceWorkerEnv | null;
if (!env) throw new Error("Missing test worker environment");
const warnFile = process.env.BALANCE_WORKER_TEST_WARN_FILE;
const databaseFile = process.env.BALANCE_WORKER_TEST_DATABASE_FILE;
function ignoreLog(): void {}
if (databaseFile)
	setInterval(() => {
		appendFileSync(
			databaseFile,
			`${JSON.stringify({ at: Date.now(), data: databaseTimings.drain() })}\n`,
		);
	}, 1_000).unref();
const worker = await createBalanceWorker({
	ctx: {
		logger: {
			debug: ignoreLog,
			info: process.env.BALANCE_WORKER_TEST_INFO_LOGS
				? (...args: unknown[]) => console.info(JSON.stringify(args))
				: ignoreLog,
			warn: warnFile
				? (...args: unknown[]) =>
						appendFileSync(warnFile, `${JSON.stringify(args)}\n`)
				: ignoreLog,
			error: console.error,
		},
		onError: ({ cause }) => console.error(cause),
	},
	config: { env, stateBackend: "postgres" },
});
await worker.start();
process.once("SIGTERM", async () => {
	await worker.stop();
	process.exit(0);
});
