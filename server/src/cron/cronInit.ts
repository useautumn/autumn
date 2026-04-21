import "../sentry.ts";
import { CronJob } from "cron";
import { initDrizzle } from "../db/initDrizzle.js";
import { logger } from "../external/logtail/logtailUtils.js";
import { runInvoiceCron } from "./invoiceCron/runInvoiceCron.js";
import { runOneOffCleanup } from "./oneoffCron/runOneOffCleanup.js";
import { runProductCron } from "./productCron/runProductCron.js";
import { runResetCron } from "./resetCron/runResetCron.js";
import type { CronContext } from "./utils/CronContext.js";

const { db, client } = initDrizzle();

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
	await client.end();
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("Received SIGINT signal, closing database connection...");
	await client.end();
	process.exit(0);
});
