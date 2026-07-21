import {
	type EntInterval,
	type FullCusEntWithFullCusProduct,
	getCycleEnd,
	isFiniteNumber,
} from "@autumn/shared";
import type { PooledResetPolicy } from "@/internal/billing/v2/pooledBalances/utils/pooledResetPolicy.js";
import { throwUnsupportedPooledEntitlement } from "./throwUnsupportedPooledEntitlement.js";

// Free pools run on the policy's anchor; owned pools (subscription / license
// parent) inherit the source row's schedule until their owner resets them.
export const resolvePoolResetSchedule = ({
	resetPolicy,
	customerEntitlement,
	interval,
	intervalCount,
}: {
	resetPolicy: PooledResetPolicy;
	customerEntitlement: FullCusEntWithFullCusProduct;
	interval: EntInterval;
	intervalCount: number;
}): { resetCycleAnchor: number; nextResetAt: number } => {
	if ("lazy" in resetPolicy) {
		return {
			resetCycleAnchor: resetPolicy.lazy.anchor,
			nextResetAt: getCycleEnd({
				anchor: resetPolicy.lazy.anchor,
				interval,
				intervalCount,
				now: resetPolicy.lazy.now,
			}),
		};
	}

	const resetCycleAnchor = customerEntitlement.reset_cycle_anchor;
	const nextResetAt = customerEntitlement.next_reset_at;
	if (!isFiniteNumber(resetCycleAnchor) || !isFiniteNumber(nextResetAt)) {
		return throwUnsupportedPooledEntitlement({
			message: `Pooled feature '${customerEntitlement.entitlement.feature.id}' requires a reset anchor and next reset date.`,
		});
	}

	return { resetCycleAnchor, nextResetAt };
};
