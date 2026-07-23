import "../sentry.ts";
import { CronJob } from "cron";
import { initDrizzle } from "../db/initDrizzle.js";
import { startPgPoolMonitor, stopPgPoolMonitor } from "../db/pgPoolMonitor.js";
import { runDbProbes } from "../db/probes/runDbProbes.js";
import { logger } from "../external/logtail/logtailUtils.js";
import { stopAllEdgeConfigPolling } from "../internal/misc/edgeConfig/edgeConfigRegistry.js";
import {
	describeSlotGate,
	isActiveSlot,
} from "../queue/blueGreen/blueGreenGate.js";
import {
	startBlueGreenHeartbeat,
	stopBlueGreenHeartbeat,
} from "../queue/blueGreen/blueGreenHeartbeat.js";
import { stopBlueGreenSlotStorePolling } from "../queue/blueGreen/blueGreenSlotStore.js";
import { runInvoiceCron } from "./invoiceCron/runInvoiceCron.js";
import { runOneOffCleanup } from "./oneoffCron/runOneOffCleanup.js";
import { runOneOffExpiry } from "./oneoffCron/runOneOffExpiry.js";
import { runProductCron } from "./productCron/runProductCron.js";
import { runResetLoop } from "./resetCron/runResetLoop.js";
import { runSeatSyncCron } from "./seatSyncCron/runSeatSyncCron.js";
import type { CronContext } from "./utils/CronContext.js";

const { db, client } = initDrizzle({ name: "cron", maxConnections: 40 });
const { db: probeDb, client: probeClient } = initDrizzle({
	name: "db-probe",
	maxConnections: 2,
	connectTimeout: 5,
});
startPgPoolMonitor();
startBlueGreenHeartbeat({ db, logger, serviceName: "cron" });

const ctx: CronContext = { db, logger };
let shuttingDown = false;

const logCronHeartbeat = (job = "main") => {
	logger.info(
		{
			type: "cron_heartbeat",
			cron: {
				pid: process.pid,
				timezone: "UTC",
				job,
			},
		},
		"Cron heartbeat",
	);
};

const shouldRunTick = () => {
	if (shuttingDown) return false;

	if (process.env.DISABLE_CRON === "true") {
		console.log(`Cron disabled!`);
		return false;
	}

	// Blue-green gate: skip the tick on the idle task set so a swap doesn't
	// double-fire jobs. Fail-open on non-AWS hosts (no task identity).
	if (!isActiveSlot({ serviceName: "cron" })) {
		const reason = describeSlotGate({ serviceName: "cron" });
		logger.info("Cron tick skipped (idle slot)", {
			type: "cron_skipped_idle",
			gate: reason,
		});
		return false;
	}

	return true;
};

const main = async () => {
	if (!shouldRunTick()) return;

	logCronHeartbeat();

	await Promise.all([
		runProductCron({ ctx }),
		runInvoiceCron({ ctx }),
		runOneOffExpiry({ ctx }),
		// runClearExpiredResetCron({ ctx }),
	]);
};

// Cleanup re-derives "depleted one-off" candidates from scratch (no time
// column to seek on), so it runs on a slower cadence than the other jobs.
const oneOffCleanupTick = async () => {
	if (!shouldRunTick()) return;

	logCronHeartbeat("one_off_cleanup");

	await Promise.all([runOneOffCleanup({ ctx }), runSeatSyncCron({ ctx })]);
};

// DB health probes (long-txn / xmin pin, ...) — a separate tick so a heavy
// billing cron can't delay detection. Slot-gated like the other jobs.
const dbProbesTick = async () => {
	if (!shouldRunTick()) return;
	await runDbProbes({ db: probeDb });
};

new CronJob(
	"* * * * *", // Run every minute
	main,
	null, // onComplete
	true, // start immediately
	"UTC", // timezone (adjust as needed)
);

new CronJob(
	"*/10 * * * *", // Run every 10 minutes
	oneOffCleanupTick,
	null, // onComplete
	true, // start immediately
	"UTC", // timezone (adjust as needed)
);

new CronJob(
	"* * * * *", // Run every minute
	dbProbesTick,
	null, // onComplete
	true, // start immediately
	"UTC", // timezone (adjust as needed)
);

main();
oneOffCleanupTick();
dbProbesTick();

const resetLoopController = new AbortController();
const resetLoopPromise = runResetLoop({
	ctx,
	signal: resetLoopController.signal,
});

const shutdown = async (signal: string) => {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`Received ${signal} signal, closing database connection...`);
	resetLoopController.abort();
	stopPgPoolMonitor();
	stopBlueGreenHeartbeat({ serviceName: "cron" });
	stopBlueGreenSlotStorePolling({ serviceName: "cron" });
	stopAllEdgeConfigPolling();
	await resetLoopPromise;
	await client.end();
	await probeClient.end();
	process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
