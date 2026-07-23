import {
	type AppEnv,
	type Feature,
	notNullish,
	type Organization,
	type ResetCusEnt,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import pLimit from "p-limit";
import { buildFullSubjectOrgEnvKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectOrgEnvKey.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { getResetJobConfig } from "@/internal/misc/resetJob/resetJobStore.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { CronContext } from "../utils/CronContext";
import { clearCusEntsFromCache } from "./clearCusEntsFromCache";
import { resetCustomerEntitlement } from "./resetCustomerEntitlement";

const RESET_CONCURRENCY = 25;

export const runResetBatch = async ({ ctx }: { ctx: CronContext }) => {
	const { db, logger } = ctx;
	const startedAt = Date.now();
	const { batchSize } = getResetJobConfig();
	const limitConcurrency = pLimit(RESET_CONCURRENCY);
	const orgs = new Map<string, { org: Organization; features: Feature[] }>();
	const cusEnts = await CusEntService.getActiveResetPassed({
		db,
		batchSize,
		limit: batchSize,
		includeSeparateIntervalResets: false,
	});

	const uniqueOrgEnvs = new Map<string, { orgId: string; env: AppEnv }>();
	for (const cusEnt of cusEnts) {
		const { env, org_id: orgId } = cusEnt.customer;
		uniqueOrgEnvs.set(buildFullSubjectOrgEnvKey({ orgId, env }), {
			orgId,
			env,
		});
	}

	await Promise.all(
		[...uniqueOrgEnvs.values()].map(({ orgId, env }) =>
			limitConcurrency(async () => {
				try {
					const org = await OrgService.getWithFeatures({ db, orgId, env });
					if (org) orgs.set(buildFullSubjectOrgEnvKey({ orgId, env }), org);
				} catch (error) {
					logger.error(
						{ jobName: "reset-cus-ents", orgId, env, err: error },
						"[reset-cus-ents] failed to load org",
					);
					Sentry.captureException(error, {
						extra: { orgId, env, context: "runResetBatch.getOrgWithFeatures" },
					});
				}
			}),
		),
	);

	const updatedCusEnts: ResetCusEnt[] = [];
	const results = await Promise.all(
		cusEnts.map((cusEnt) =>
			limitConcurrency(async () => {
				const org = orgs.get(
					buildFullSubjectOrgEnvKey({
						orgId: cusEnt.customer.org_id,
						env: cusEnt.customer.env,
					}),
				);
				if (!org) return;

				return resetCustomerEntitlement({
					ctx,
					org: org.org,
					cusEnt,
					updatedCusEnts,
					persistFreeOverage: org.org.config.persist_free_overage ?? false,
				});
			}),
		),
	);

	const toUpsert = results.filter(notNullish);
	if (toUpsert.length > 0) {
		await CusEntService.upsert({ db, data: toUpsert });
	}
	await clearCusEntsFromCache({ cusEnts: updatedCusEnts });

	const result = {
		batchSize,
		fetched: cusEnts.length,
		upserted: toUpsert.length,
		durationMs: Date.now() - startedAt,
	};
	logger.info(
		{ jobName: "reset-cus-ents", ...result },
		"[reset-cus-ents] batch finished",
	);
	return result;
};
