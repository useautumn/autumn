import {
	type CustomerEntitlement,
	notNullish,
	type OrgConfig,
	OrgConfigSchema,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import * as Sentry from "@sentry/bun";
import { format } from "date-fns";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { CronContext } from "../utils/CronContext";
import { clearCusEntsFromCache } from "./clearCusEntsFromCache";
import { resetCustomerEntitlement } from "./resetCustomerEntitlement";

export const runResetCron = async ({ ctx }: { ctx: CronContext }) => {
	const { db, logger } = ctx;

	const maxIterations = 10;
	const timeoutMs = 60_000; // 1 minute
	const startTime = Date.now();

	const orgConfigCache = new Map<string, OrgConfig>();

	const getOrgConfig = async ({
		orgId,
	}: {
		orgId: string;
	}): Promise<OrgConfig | undefined> => {
		const cached = orgConfigCache.get(orgId);
		if (cached) return cached;

		try {
			const org = await OrgService.get({ db, orgId });
			const config = OrgConfigSchema.parse(org.config || {});
			orgConfigCache.set(orgId, config);
			return config;
		} catch (error) {
			console.error(
				`Reset cron: failed to fetch org config for orgId=${orgId}, skipping cusEnts for this org`,
				error,
			);

			logger.error(
				`Reset cron: failed to fetch org config for orgId=${orgId}, skipping cusEnts for this org ${error}`,
			);

			Sentry.captureException(error, {
				extra: { orgId, context: "runResetCron.getOrgConfig" },
			});
			return undefined;
		}
	};

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

				// Pre-fetch org configs for all unique org_ids in this batch
				const uniqueOrgIds = new Set(batch.map((ce) => ce.customer.org_id));
				await Promise.all(
					[...uniqueOrgIds].map((orgId) => getOrgConfig({ orgId })),
				);

				const batchResets = [];
				const updatedCusEnts: ResetCusEnt[] = [];
				for (const cusEnt of batch) {
					const orgConfig = orgConfigCache.get(cusEnt.customer.org_id);
					if (!orgConfig) continue;

					batchResets.push(
						resetCustomerEntitlement({
							ctx,
							cusEnt: cusEnt,
							updatedCusEnts,
							persistFreeOverage: orgConfig.persist_free_overage ?? false,
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
