import "../sentry.ts";
import { CronJob } from "cron";
import { initDrizzle } from "../db/initDrizzle.js";
import { logger } from "../external/logtail/logtailUtils.js";
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
import { runProductCron } from "./productCron/runProductCron.js";
import { runResetCron } from "./resetCron/runResetCron.js";
import type { CronContext } from "./utils/CronContext.js";

const { db, client } = initDrizzle();
startBlueGreenHeartbeat({ db, logger, serviceName: "cron" });

const logCronHeartbeat = () => {
	logger.info(
		{
			type: "cron_heartbeat",
			cron: {
				pid: process.pid,
				timezone: "UTC",
			},
		},
		"Cron heartbeat",
	);
};

const main = async () => {
	if (process.env.DISABLE_CRON === "true") {
		console.log(`Cron disabled!`);
		return;
	}

	// Blue-green gate: skip the tick on the idle task set so a swap doesn't
	// double-fire jobs. Fail-open on non-AWS hosts (no task identity).
	if (!isActiveSlot({ serviceName: "cron" })) {
		const reason = describeSlotGate({ serviceName: "cron" });
		logger.info("Cron tick skipped (idle slot)", {
			type: "cron_skipped_idle",
			gate: reason,
		});
		return;
	}

	logCronHeartbeat();

	const ctx: CronContext = {
		db,
		logger,
	};
	await Promise.all([
		runProductCron({ ctx }),
		runResetCron({ ctx }),
		runInvoiceCron({ ctx }),
		runOneOffCleanup({ ctx }),
	]);
};

new CronJob(
	"* * * * *", // Run every minute
	main,
	null, // onComplete
	true, // start immediately
	"UTC", // timezone (adjust as needed)
);

main();

process.on("SIGTERM", async () => {
	console.log("Received SIGTERM signal, closing database connection...");
	stopBlueGreenHeartbeat({ serviceName: "cron" });
	stopBlueGreenSlotStorePolling({ serviceName: "cron" });
	await client.end();
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("Received SIGINT signal, closing database connection...");
	stopBlueGreenHeartbeat({ serviceName: "cron" });
	stopBlueGreenSlotStorePolling({ serviceName: "cron" });
	await client.end();
	process.exit(0);
});
