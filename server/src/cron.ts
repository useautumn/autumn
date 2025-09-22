import dotenv from "dotenv";
import {
	CustomerEntitlement,
	FullCusEntWithProduct,
	ResetCusEnt,
} from "@autumn/shared";
import { CusEntService } from "./internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { format } from "date-fns";
import { CronJob } from "cron";
import { UTCDate } from "@date-fns/utc";
import { initDrizzle } from "./db/initDrizzle.js";
import { resetCustomerEntitlement } from "./cron/cronUtils.js";
import { OrgService } from "./internal/orgs/OrgService.js";
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

		const cacheEnabledOrgs = await OrgService.getCacheEnabledOrgs({ db });

		const batchSize = 100;
		for (let i = 0; i < cusEnts.length; i += batchSize) {
			const batch = cusEnts.slice(i, i + batchSize);
			const batchResets = [];
			for (const cusEnt of batch) {
				batchResets.push(
					resetCustomerEntitlement({
						db,
						cusEnt: cusEnt,
						cacheEnabledOrgs,
					}),
				);
			}

			let results = await Promise.all(batchResets);

			let toUpsert = results.filter(notNullish);
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

const job = new CronJob(
	"* * * * *", // Run every minute
	function () {
		cronTask();
	},
	null, // onComplete
	true, // start immediately
	"UTC", // timezone (adjust as needed)
);

cronTask();

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
