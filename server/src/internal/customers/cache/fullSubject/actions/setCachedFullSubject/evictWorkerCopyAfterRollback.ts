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
