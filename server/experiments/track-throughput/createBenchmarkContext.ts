import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
} from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

export const createBenchmarkContext = async (): Promise<AutumnContext> => {
	const orgSlug = process.env.TESTS_ORG;
	if (!orgSlug) throw new Error("TESTS_ORG is required");

	const { db } = initDrizzle();
	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) throw new Error(`Organization "${orgSlug}" not found`);

	return {
		org,
		env: AppEnv.Sandbox,
		features: await FeatureService.list({
			db,
			orgId: org.id,
			env: AppEnv.Sandbox,
		}),
		db,
		dbGeneral: db,
		logger,
		redisV2: resolveRedisV2(),
		id: generateId("track_bench"),
		isPublic: false,
		authType: AuthType.SecretKey,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		expand: [],
		extraLogs: {},
		testOptions: {
			skipWebhooks: true,
		},
	};
};
