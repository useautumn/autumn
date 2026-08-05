import {
	type AppEnv,
	AuthType,
	createdAtToVersion,
	ErrCode,
	RecaseError,
} from "@autumn/shared";

import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeRolloutSnapshot } from "@/internal/misc/edgeConfigs/rollouts/rolloutUtils.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";

export const createWorkerAutumnContext = async ({
	db,
	orgId,
	env,
	logger,
	workerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	logger: Logger;
	workerId: string;
}): Promise<AutumnContext> => {
	// 1. Get org with features
	const data = await getOrgWithFeaturesCached({
		db,
		orgId,
		env,
		requestId: workerId,
	});

	if (!data) {
		logger.warn(`Org ${orgId} not found in DB`);
		throw new RecaseError({
			message: "Org not found",
			code: ErrCode.OrgNotFound,
			statusCode: 500,
		});
	}

	const { org, features } = data;

	const apiVersion = createdAtToVersion({
		createdAt: org.created_at || Date.now(),
	});

	const rolloutSnapshot = computeRolloutSnapshot({ orgId: org.id });

	const ctx = {
		org,
		env,
		features,

		db,
		dbGeneral: db,
		logger,
		redisV2: resolveRedisV2(),
		expand: [],

		id: workerId,
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion,
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		extraLogs: {},
		rolloutSnapshot,
	} satisfies AutumnContext;
	return getCtxWithCustomerRedis({ ctx }).ctx;
};
