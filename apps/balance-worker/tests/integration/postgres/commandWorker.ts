import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";

const env = JSON.parse(
	process.env.BALANCE_WORKER_TEST_ENV ?? "null",
) as BalanceWorkerEnv | null;
if (!env) throw new Error("Missing test worker environment");
function ignoreLog(): void {}
const worker = await createBalanceWorker({
	ctx: {
		logger: {
			debug: ignoreLog,
			info: ignoreLog,
			warn: ignoreLog,
			error: console.error,
		},
		onError: ({ cause }) => console.error(cause),
	},
	config: { env, stateBackend: "postgres" },
});
await worker.start();
// A graceful stop releases the partition so the next worker can own it; a crash test kills instead.
process.once("SIGTERM", async () => {
	await worker.stop();
	process.exit(0);
});
