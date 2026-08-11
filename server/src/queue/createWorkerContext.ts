import { type AppEnv, AuthType, createdAtToVersion } from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs.js";
import type { DrizzleCli } from "../db/initDrizzle.js";
import type { Logger } from "../external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "../external/redis/customerRedisRouting.js";
import { resolveRedisV2 } from "../external/redis/resolveRedisV2.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import { computeRolloutSnapshot } from "../internal/misc/rollouts/rolloutUtils.js";
import { generateId } from "../utils/genUtils.js";

export const createWorkerContext = async ({
	db,
	payload,
	logger,
	skipCache = true,
	throwOnTransientOrgLookupError = false,
}: {
	db: DrizzleCli;
	payload: {
		orgId?: string;
		env?: AppEnv;
		customerId?: string;
		requestId?: string;
	};
	logger: Logger;
	skipCache?: boolean;
	throwOnTransientOrgLookupError?: boolean;
}) => {
	const { orgId, env, customerId, requestId } = payload;
	if (!orgId || !env) return;

	// Fetch org with features once for all items. A missing org means it was
	// deleted after the job was queued (common in tests) — skip, don't fail.
	// Deliberately not gated on `skipCache` — that flag governs the customer
	// cache (workers want fresh balances), whereas this is org config that
	// changes rarely and is invalidated by clearOrgCache.
	let orgData: Awaited<ReturnType<typeof getOrgWithFeaturesCached>>;
	try {
		orgData = await getOrgWithFeaturesCached({ db, orgId, env, requestId });
	} catch (error) {
		if (
			throwOnTransientOrgLookupError &&
			(isTransientDbError({ error }) || isTransientRedisError({ error }))
		) {
			throw error;
		}
		orgData = null;
	}

	if (!orgData) {
		logger.warn(`Org ${orgId} (${env}) not found — skipping queued job`);
		return;
	}

	const { org, features } = orgData;
	const apiVersion = createdAtToVersion({
		createdAt: org.created_at ?? Date.now(),
	});

	const rolloutSnapshot = computeRolloutSnapshot({
		orgId: org.id,
		customerId,
	});

	const workerLogger = addAppContextToLogs({
		logger: logger,
		appContext: {
			org_id: org?.id,
			org_slug: org?.slug,
			customer_id: customerId,
			env: env,
			auth_type: AuthType.Worker,
			api_version: apiVersion.semver,
			full_subject_bucket: customerId
				? (rolloutSnapshot.customerBucket ?? undefined)
				: undefined,
			full_subject_rollout_enabled: customerId
				? rolloutSnapshot.enabled
				: undefined,
		},
	});

	const ctx: AutumnContext = {
		org,
		env,
		features,
		customerId,

		db,
		dbGeneral: db,
		logger: workerLogger,
		redisV2: resolveRedisV2({ customerId }),

		id: requestId || generateId("job"),
		timestamp: Date.now(),
		isPublic: false,
		authType: AuthType.Worker,
		apiVersion,
		scopes: [],
		expand: [],
		skipCache,
		extraLogs: {},
		rolloutSnapshot,
	};
	return getCtxWithCustomerRedis({ ctx, customerId }).ctx;
};
