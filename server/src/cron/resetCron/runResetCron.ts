import {
	type CustomerEntitlement,
	notNullish,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format } from "date-fns";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { CronContext } from "../utils/CronContext";
import { clearCusEntsFromCache } from "./clearCusEntsFromCache";
import { resetCustomerEntitlement } from "./resetCustomerEntitlement";

export const runResetCron = async ({ ctx }: { ctx: CronContext }) => {
	const { db } = ctx;

	const maxIterations = 10;
	const timeoutMs = 60_000; // 1 minute
	const startTime = Date.now();

	try {
		let iteration = 0;

		while (iteration < maxIterations && Date.now() - startTime < timeoutMs) {
			iteration++;

			const cusEnts = await CusEntService.getActiveResetPassed({
				db,
				batchSize: 5_000,
				limit: 5_000,
			});

			if (cusEnts.length < 5_000) {
				console.log(
					`Reset cron: only ${cusEnts.length} entitlements to reset, skipping (lazy reset will handle)`,
				);
				break;
			}

			console.log(
				`Reset cron iteration ${iteration}: processing ${cusEnts.length} entitlements`,
			);

			const batchSize = 1000;
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
