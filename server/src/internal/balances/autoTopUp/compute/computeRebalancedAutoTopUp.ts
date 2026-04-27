import {
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { runDeductionPass } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript.js";
import type { DeductionUpdates } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";

export type AutoTopupRebalanceDelta = {
	cusEntId: string;
	delta: number;
};

/**
 * Sort order for paydown — mirrors deductFromCusEntsTypescript's pass-2 sort so overage
 * heals on the cusEnts that accrued it first (`usage_allowed: true`), with a stable
 * `created_at` tiebreaker.
 */
const sortForPaydown = (
	cusEnts: FullCusEntWithFullCusProduct[],
): FullCusEntWithFullCusProduct[] => {
	return [...cusEnts].sort((a, b) => {
		const leftUsageAllowed = a.usage_allowed ?? false;
		const rightUsageAllowed = b.usage_allowed ?? false;

		if (leftUsageAllowed !== rightUsageAllowed) {
			return leftUsageAllowed ? -1 : 1;
		}

		return (a.created_at ?? 0) - (b.created_at ?? 0);
	});
};

const isPaydownCandidate = (cusEnt: FullCusEntWithFullCusProduct): boolean => {
	if (isBooleanCusEnt({ cusEnt })) return false;
	if (isUnlimitedCusEnt(cusEnt)) return false;
	if (isEntityScopedCusEnt(cusEnt)) return false;
	return true;
};

const hasTopLevelOverage = (cusEnt: FullCusEntWithFullCusProduct): boolean =>
	(cusEnt.balance ?? 0) < 0;

/**
 * Compute the list of balance deltas needed to rebalance an auto top-up:
 *   1. Pay down overage on non-prepaid, non-entity-scoped top-level cusEnts first
 *      (capped at 0 per cusEnt — the paydown primitive).
 *   2. Route the remainder to the prepaid one-off cusEnt.
 *
 * Deltas are applied at execute time via atomic SQL balance + delta increments, so
 * they're race-safe against concurrent deductions. Entity-scoped cusEnts are excluded
 * because there's no per-entity atomic primitive today (future work).
 */
export const computeRebalancedAutoTopUp = ({
	fullCustomer,
	featureId,
	quantity,
	prepaidCustomerEntitlementId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	quantity: number;
	prepaidCustomerEntitlementId: string;
}): { deltas: AutoTopupRebalanceDelta[] } => {
	if (quantity <= 0) return { deltas: [] };

	const cusEntsForFeature = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	const prepaidCusEnt = cusEntsForFeature.find(
		(cusEnt) => cusEnt.id === prepaidCustomerEntitlementId,
	);

	if (!prepaidCusEnt) return { deltas: [] };

	const candidates = cusEntsForFeature.filter(
		(cusEnt) =>
			cusEnt.id !== prepaidCustomerEntitlementId &&
			isPaydownCandidate(cusEnt) &&
			hasTopLevelOverage(cusEnt),
	);

	const deltas: AutoTopupRebalanceDelta[] = [];
	let remainder = quantity;

	if (candidates.length > 0) {
		const sortedCandidates = sortForPaydown(candidates);

		const updates: DeductionUpdates = {};
		const mutationLogs: MutationLogItem[] = [];

		const passResult = runDeductionPass({
			cusEnts: sortedCandidates,
			amountToDeduct: -quantity,
			maxBalance: 0,
			updates,
			mutationLogs,
		});

		remainder = Math.abs(passResult.amountToDeduct);

		for (const [cusEntId, update] of Object.entries(updates)) {
			const delta = -update.deducted;
			if (delta === 0) continue;
			deltas.push({ cusEntId, delta });
		}
	}

	if (remainder > 0) {
		deltas.push({ cusEntId: prepaidCusEnt.id, delta: remainder });
	}

	return { deltas };
};
