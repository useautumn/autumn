/**
 * One balance worker built by createBalanceWorker, the same call main.ts makes: HTTP worker threads,
 * inline handlers, held replies and the producer thread, so a track waits on its Produce exactly as it
 * does in prod. Lines go to stdout as JSON: every partition-producer request of 100ms or more, and
 * once a second the slowest Produce and commit of that second.
 */
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import { commitSummaries } from "../../../src/logging/commitSummaries.js";
import { kafkaRequestTimings } from "../../../src/logging/kafkaRequestTimings.js";

const SLOW_REQUEST_MS = 100;

const env = JSON.parse(process.env.BENCH_WORKER_ENV ?? "null") as
	| (BalanceWorkerEnv & { BENCH_NAME: string })
	| null;
if (!env) throw new Error("BENCH_WORKER_ENV is required");
const name = env.BENCH_NAME;

function emit(event: string, fields: Record<string, unknown> = {}): void {
	process.stdout.write(
		`${JSON.stringify({ t: Date.now(), worker: name, event, ...fields })}\n`,
	);
}
function describe(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (_, item) =>
			item instanceof Error
				? { name: item.name, message: item.message, cause: item.cause }
				: item,
		),
	);
}
function ignoreLog(): void {}
const logger: AutumnLogger = {
	debug: ignoreLog,
	info: ignoreLog,
	warn: (...args: unknown[]) => emit("log.warn", { args: describe(args) }),
	warning: (...args: unknown[]) => emit("log.warn", { args: describe(args) }),
	error: (...args: unknown[]) => emit("log.error", { args: describe(args) }),
	child: () => logger,
};

// Read per runtime as it is built, so wrapping it before the worker starts sees every producer request.
const record = kafkaRequestTimings.record;
let produceMaxMs = 0;
kafkaRequestTimings.record = (timing) => {
	record(timing);
	if (timing.apiName === "Produce")
		produceMaxMs = Math.max(produceMaxMs, timing.durationMs);
	if (timing.durationMs >= SLOW_REQUEST_MS)
		emit("kafka.slow_request", {
			api: timing.apiName,
			broker: timing.broker,
			durationMs: timing.durationMs,
		});
};
setInterval(() => {
	let commitMaxMs = 0;
	let queuedMaxMs = 0;
	let unknown = 0;
	for (const row of commitSummaries.drain()) {
		commitMaxMs = Math.max(commitMaxMs, row.commitMs.maxMs);
		queuedMaxMs = Math.max(queuedMaxMs, row.queuedMsMax);
		unknown += row.unknown + row.notCommitted;
	}
	emit("window", { produceMaxMs, commitMaxMs, queuedMaxMs, unknown });
	produceMaxMs = 0;
}, 1_000).unref();

const worker = await createBalanceWorker({
	ctx: {
		logger,
		onError: ({ cause }) => emit("error", { cause: describe(cause) }),
		onServiceStopped: ({ cause, scope }) =>
			emit("service.stopped", { scope, cause: describe(cause) }),
	},
	config: { env },
});
await worker.start();
emit("worker.started");

process.once("SIGTERM", async () => {
	await worker.stop();
	process.exit(0);
});
