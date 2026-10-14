import { getPostgresPools } from "@autumn/postgres";
import { flushTelemetry } from "@/utils/logging/initLogger.js";
import "../sentry.ts";
import { CronJob } from "cron";
import { initDrizzle } from "../db/initDrizzle.js";
import { startPgPoolMonitor, stopPgPoolMonitor } from "../db/pgPoolMonitor.js";
import { runDbProbes } from "../db/probes/runDbProbes.js";
import { logger } from "../external/logtail/logtailUtils.js";
import { refreshCeBalancesCache } from "../external/motherduck/refreshCeBalancesCache.js";
import { runResetLoopV2 } from "../internal/balances/batchReset/runResetLoopV2.js";
import { runLockSweepLoop } from "../internal/balances/lockSweep/runLockSweepLoop.js";
import { stopAllEdgeConfigPolling } from "../internal/misc/edgeConfig/edgeConfigRegistry.js";
import { isMotherduckCacheRefreshDisabled } from "../internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import {
	describeSlotGate,
	isActiveSlot,
} from "../queue/blueGreen/blueGreenGate.js";
import {
	startBlueGreenHeartbeat,
	stopBlueGreenHeartbeat,
} from "../queue/blueGreen/blueGreenHeartbeat.js";
import { stopBlueGreenSlotStorePolling } from "../queue/blueGreen/blueGreenSlotStore.js";
import { shutdownSqsSendBatchers } from "../queue/queueUtils.js";
import { runExpiredGrantCleanup } from "./grantCron/runExpiredGrantCleanup.js";
import { runInvoiceCron } from "./invoiceCron/runInvoiceCron.js";
import { runLongLivedCheckoutExpiry } from "./longLivedCheckoutCron/runLongLivedCheckoutExpiry";
import { runOneOffCleanup } from "./oneoffCron/runOneOffCleanup.js";
import { runOneOffExpiry } from "./oneoffCron/runOneOffExpiry.js";
import { runProductCron } from "./productCron/runProductCron.js";
import { runSeatSyncCron } from "./seatSyncCron/runSeatSyncCron.js";
import type { CronContext } from "./utils/CronContext.js";

const pools = getPostgresPools();
const { db, client } = initDrizzle({ name: "cron", pool: pools.cron });
const { db: probeDb, client: probeClient } = initDrizzle({
	name: "db-probe",
	pool: pools.dbProbe,
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
		runLongLivedCheckoutExpiry({ ctx }),
	]);
};

const oneOffCleanupTick = async () => {
	if (!shouldRunTick()) return;

	logCronHeartbeat("one_off_cleanup");

	await Promise.all([
		runOneOffCleanup({ ctx }),
		runSeatSyncCron({ ctx }),
		runExpiredGrantCleanup({ ctx }),
	]);
};

const dbProbesTick = async () => {
	if (!shouldRunTick()) return;
	await runDbProbes({ db: probeDb });
};

const mdCacheRefreshTick = async () => {
	if (!shouldRunTick()) return;
	if (!process.env.MOTHERDUCK_RW_TOKEN) return;
	if (isMotherduckCacheRefreshDisabled()) return;

	logCronHeartbeat("md_cache_refresh");
	await refreshCeBalancesCache({ logger });
};

new CronJob("* * * * *", main, null, true, "UTC");

new CronJob("*/10 * * * *", oneOffCleanupTick, null, true, "UTC");

new CronJob("* * * * *", dbProbesTick, null, true, "UTC");

new CronJob("*/20 * * * *", mdCacheRefreshTick, null, true, "UTC");

main();
oneOffCleanupTick();
dbProbesTick();

const resetLoopController = new AbortController();
const resetLoopV2Promise = runResetLoopV2({
	ctx,
	signal: resetLoopController.signal,
});
const lockSweepLoopPromise = runLockSweepLoop({
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
	await Promise.all([resetLoopV2Promise, lockSweepLoopPromise]);
	await shutdownSqsSendBatchers();
	await client.end();
	await probeClient.end();
	await flushTelemetry();
	process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
