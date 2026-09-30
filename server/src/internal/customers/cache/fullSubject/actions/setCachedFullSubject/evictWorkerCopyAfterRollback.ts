import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { resolveRolloutOrgId } from "@/internal/misc/rollouts/resolveRolloutOrgId.js";
import {
	ACTIVE_ROLLOUT_ID,
	isRolloutCacheStale,
} from "@/internal/misc/rollouts/rolloutUtils.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";

const LOOKBACK_MS = FULL_SUBJECT_CACHE_TTL_SECONDS * 1000;

/**
 * A customer back on Redis is about to move balances the worker's copy will not see, so the worker drops that copy.
 * Fire-and-forget: the view write never waits on it, and a failure is only logged.
 */
export const evictWorkerCopyAfterRollback = ({
	ctx,
	customerId,
	evict = evictBalanceWorkerCustomer,
}: {
	ctx: AutumnContext;
	customerId: string;
	evict?: typeof evictBalanceWorkerCustomer;
}): void => {
	if (isBalanceWorkerRolloutEnabled({ ctx, customerId })) return;

	// Asks "did this customer come back from the worker within the lookback?" of the stale-view check.
	const now = Date.now();
	const cameBackFromWorker = isRolloutCacheStale({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: resolveRolloutOrgId({ org: ctx.org }),
		customerId,
		cachedAt: now - LOOKBACK_MS,
		now,
	});
	if (!cameBackFromWorker) return;

	evict({ ctx, customerId }).catch((error) => {
		ctx.logger.warn("[balance-worker] evict after rollback failed", {
			error,
			data: { customerId },
		});
	});
};
