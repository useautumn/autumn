import type { CustomerEntitlement, ResetCusEnt } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { CronJob } from "cron";
import { format } from "date-fns";
import dotenv from "dotenv";
import { resetCustomerEntitlement } from "./cron/cronUtils.js";
import { runProductCron } from "./cron/productCron/runProductCron.js";
import { initDrizzle } from "./db/initDrizzle.js";
import { CusEntService } from "./internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { notNullish } from "./utils/genUtils.js";

dotenv.config();

const { db, client } = initDrizzle();

export const cronTask = async () => {
	console.log(
		"\n----------------------------------\nRUNNING RESET CRON:",
		format(new UTCDate(), "yyyy-MM-dd HH:mm:ss"),
	);

	try {
		const cusEnts: ResetCusEnt[] = await CusEntService.getActiveResetPassed({
			db,
			batchSize: 500,
		});

		const batchSize = 100;
		for (let i = 0; i < cusEnts.length; i += batchSize) {
			const batch = cusEnts.slice(i, i + batchSize);
			const batchResets = [];
			for (const cusEnt of batch) {
				batchResets.push(
					resetCustomerEntitlement({
						db,
						cusEnt: cusEnt,
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
	await Promise.all([cronTask(), runProductCron()]);
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
