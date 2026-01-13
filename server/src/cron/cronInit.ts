import "../sentry.ts";
import type { CustomerEntitlement, ResetCusEnt } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { CronJob } from "cron";
import { format } from "date-fns";
import { initDrizzle } from "../db/initDrizzle.js";
import { logger } from "../external/logtail/logtailUtils.js";
import { CusEntService } from "../internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { notNullish } from "../utils/genUtils.js";
import {
	clearCusEntsFromCache,
	resetCustomerEntitlement,
} from "./cronUtils.js";
import { runInvoiceCron } from "./invoiceCron/runInvoiceCron.js";
import { runProductCron } from "./productCron/runProductCron.js";
import type { CronContext } from "./utils/CronContext.js";

const { db, client } = initDrizzle();

export const cronTask = async () => {
	try {
		// const [productCusEnts, looseCusEnts] = await Promise.all([
		// 	CusEntService.getActiveResetPassed({ db, batchSize: 500 }),
		// 	CusEntService.getLooseResetPassed({ db, batchSize: 500 }),
		// ]);
		// const cusEnts: ResetCusEnt[] = [...productCusEnts, ...looseCusEnts];
		const cusEnts = await CusEntService.getActiveResetPassed({
			db,
			batchSize: 500,
		});

		const batchSize = 100;
		for (let i = 0; i < cusEnts.length; i += batchSize) {
			const batch = cusEnts.slice(i, i + batchSize);
			const batchResets = [];
			const updatedCusEnts: ResetCusEnt[] = [];
			for (const cusEnt of batch) {
				batchResets.push(
					resetCustomerEntitlement({
						db,
						cusEnt: cusEnt,
						updatedCusEnts,
					}),
				);
			}

			const results = await Promise.all(batchResets);

			const toUpsert = results.filter(notNullish);
			await CusEntService.upsert({
				db,
				data: toUpsert as CustomerEntitlement[],
			});
			console.log(`Upserted ${toUpsert.length} short entitlements`);

			await clearCusEntsFromCache({ cusEnts: updatedCusEnts });
		}

		console.log(
			"FINISHED RESET CRON:",
			format(new UTCDate(), "yyyy-MM-dd HH:mm:ss"),
		);
		console.log("----------------------------------\n");
	} catch (error) {
		console.error("Error getting entitlements for reset:", error);
		return;
	}

	// await client.end();
};

const main = async () => {
	if (process.env.DISABLE_CRON === "true") {
		console.log(`Cron disabled!`);
		return;
	}

	const ctx: CronContext = {
		db,
		logger,
	};
	await Promise.all([cronTask(), runProductCron(), runInvoiceCron({ ctx })]);
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
