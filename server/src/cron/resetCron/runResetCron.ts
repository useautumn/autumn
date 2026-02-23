import {
	type CustomerEntitlement,
	notNullish,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format } from "date-fns";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { clearCusEntsFromCache, resetCustomerEntitlement } from "../cronUtils";
import type { CronContext } from "../utils/CronContext";

export const runResetCron = async ({ ctx }: { ctx: CronContext }) => {
	const { db } = ctx;
	try {
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
};
