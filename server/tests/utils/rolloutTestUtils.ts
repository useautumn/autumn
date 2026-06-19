import { timeout } from "@tests/utils/genUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { FULL_SUBJECT_ROLLOUT_ID } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import {
	removeRolloutOrg,
	updateRolloutPercent,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";

const POLL_SETTLE_MS = 3000;

/**
 * Isolated test envs (`bun tw` µVMs) force the v2-cache rollout to 100% globally
 * via TW_FORCE_FULL_SUBJECT_ROLLOUT (no S3/edge-config). When that's set the
 * per-org rollout writes here are both unnecessary AND impossible (the S3
 * PutObject has no creds and would throw), so they no-op.
 */
const FORCE_FULL_SUBJECT_ROLLOUT = ["1", "true", "yes"].includes(
	(process.env.TW_FORCE_FULL_SUBJECT_ROLLOUT ?? "").trim().toLowerCase(),
);

/**
 * Sets the v2-cache rollout percentage for a specific org and waits
 * for the server's edge config poll to pick up the change.
 */
export const setOrgRolloutPercent = async ({
	orgId,
	percent,
}: {
	orgId: string;
	percent: number;
}) => {
	if (FORCE_FULL_SUBJECT_ROLLOUT) {
		return;
	}
	await updateRolloutPercent({
		rolloutId: FULL_SUBJECT_ROLLOUT_ID,
		orgId,
		percent,
	});
	await timeout(POLL_SETTLE_MS);
};

/**
 * Strips _cachedAt from the v1 FullCustomer cache entry to simulate
 * a legacy cache entry without a timestamp.
 */
export const removeCachedAtField = async ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => {
	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
	await redis.call("JSON.DEL", cacheKey, "$._cachedAt");
};

/**
 * Removes the org-level rollout override (cleanup after test).
 */
export const cleanupOrgRollout = async ({ orgId }: { orgId: string }) => {
	if (FORCE_FULL_SUBJECT_ROLLOUT) {
		return;
	}
	await removeRolloutOrg({
		rolloutId: FULL_SUBJECT_ROLLOUT_ID,
		orgId,
	});
};
