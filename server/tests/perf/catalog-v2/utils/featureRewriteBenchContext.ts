/**
 * Dedicated DEV-DB org for catalogV2 feature-rewrite execute benches.
 *
 *   bun tests/perf/catalog-v2/seedFeatureRewriteBench.ts
 *   bun tests/perf/catalog-v2/benchExecuteFeatureRewrites.ts
 */

import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	type Organization,
} from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

export const FEATURE_REWRITE_BENCH_ORG_SLUG = "catalog-v2-rewrite-bench";
export const FEATURE_REWRITE_BENCH_ENV = AppEnv.Sandbox;
export const FEATURE_REWRITE_BENCH_FEATURE_ID = "cv2_rw_bench_feat";
export const FEATURE_REWRITE_BENCH_PRODUCT_ID = "cv2_rw_bench_prod";
export const FEATURE_REWRITE_BENCH_ROW_COUNT = FEATURE_REWRITE_ROW_LIMIT;

/** Refuse to run against anything that smells like prod. */
export const assertBenchDatabaseSafe = () => {
	const url = process.env.DATABASE_URL ?? "";
	if (url.includes("us-east-2")) {
		throw new Error("bench: refusing to run against a prod DATABASE_URL");
	}
};

export type FeatureRewriteBenchContext = {
	ctx: AutumnContext;
	org: Organization;
};

export const getFeatureRewriteBenchContext =
	async (): Promise<FeatureRewriteBenchContext> => {
		assertBenchDatabaseSafe();
		const { db } = initDrizzle();

		let org = await OrgService.getBySlug({
			db,
			slug: FEATURE_REWRITE_BENCH_ORG_SLUG,
		});
		if (!org) {
			org = await OrgService.create({
				db,
				id: generateId("org"),
				slug: FEATURE_REWRITE_BENCH_ORG_SLUG,
				name: "CatalogV2 Feature Rewrite Bench",
				createdBy: "catalog-v2-rewrite-bench",
			});
		}

		const ctx: AutumnContext = {
			org,
			env: FEATURE_REWRITE_BENCH_ENV,
			features: [],
			db,
			dbGeneral: db,
			logger,
			redisV2: resolveRedisV2(),
			id: generateId("bench"),
			isPublic: false,
			authType: AuthType.Unknown,
			apiVersion: new ApiVersionClass(LATEST_VERSION),
			timestamp: Date.now(),
			scopes: [],
			skipCache: false,
			expand: [],
			extraLogs: {},
		};

		return { ctx, org };
	};
