import {
	type AppEnv,
	type CustomerEntitlement,
	type Feature,
	notNullish,
	type Organization,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import * as Sentry from "@sentry/bun";
import { format } from "date-fns";
import { buildFullSubjectOrgEnvKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectOrgEnvKey.js";
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

	const orgWithFeaturesCache = new Map<
		string,
		{ org: Organization; features: Feature[] }
	>();

	const getOrgWithFeatures = async ({
		orgId,
		env,
	}: {
		orgId: string;
		env: AppEnv;
	}): Promise<{ org: Organization; features: Feature[] } | undefined> => {
		const cacheKey = buildFullSubjectOrgEnvKey({ orgId, env });
		const cached = orgWithFeaturesCache.get(cacheKey);
		if (cached) return cached;

		try {
			const orgWithFeatures = await OrgService.getWithFeatures({
				db,
				orgId,
				env,
			});
			if (!orgWithFeatures) return undefined;
			orgWithFeaturesCache.set(cacheKey, orgWithFeatures);
			return orgWithFeatures;
		} catch (error) {
			console.error(
				`Reset cron: failed to fetch org with features for orgId=${orgId}, env=${env}, skipping cusEnts for this org`,
				error,
			);

			logger.error(
				`Reset cron: failed to fetch org with features for orgId=${orgId}, env=${env}, skipping cusEnts for this org ${error}`,
			);

			Sentry.captureException(error, {
				extra: { orgId, env, context: "runResetCron.getOrgWithFeatures" },
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

				const uniqueOrgEnvs = new Map<string, { orgId: string; env: AppEnv }>();
				for (const customerEntitlement of batch) {
					const env = customerEntitlement.customer.env as AppEnv;
					const orgId = customerEntitlement.customer.org_id;
					uniqueOrgEnvs.set(buildFullSubjectOrgEnvKey({ orgId, env }), {
						orgId,
						env,
					});
				}
				await Promise.all(
					[...uniqueOrgEnvs.values()].map(({ orgId, env }) =>
						getOrgWithFeatures({ orgId, env }),
					),
				);

				const batchResets = [];
				const updatedCusEnts: ResetCusEnt[] = [];
				for (const cusEnt of batch) {
					const orgWithFeatures = orgWithFeaturesCache.get(
						buildFullSubjectOrgEnvKey({
							orgId: cusEnt.customer.org_id,
							env: cusEnt.customer.env as AppEnv,
						}),
					);
					if (!orgWithFeatures) continue;

					batchResets.push(
						resetCustomerEntitlement({
							ctx,
							cusEnt: cusEnt,
							updatedCusEnts,
							persistFreeOverage:
								orgWithFeatures.org.config.persist_free_overage ?? false,
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

				await clearCusEntsFromCache({
					cusEnts: updatedCusEnts,
				});
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
