import {
	type FullCusEntWithFullCusProduct,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { runDeductionPass } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";
import type { DeductionUpdates } from "@/internal/balances/utils/types/deductionUpdate";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem";

/**
 * Sort cusEnts for auto top-up paydown.
 *
 * Order (matches deductFromCusEntsTypescript's pass-2 sort for consistency):
 *   1. `usage_allowed: true` cusEnts first — they're the ones that accrued the overage,
 *      so they should be healed first.
 *   2. Then by `created_at` ascending (oldest first) so tie-breaking is deterministic.
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

/**
 * True if this cusEnt can participate in paydown via a deferred-safe delta update.
 * Boolean, unlimited, and entity-scoped cusEnts are skipped because this flow executes
 * asynchronously and only top-level numeric balances can currently be applied as deltas.
 */
const isPaydownCandidate = (cusEnt: FullCusEntWithFullCusProduct): boolean => {
	if (isBooleanCusEnt({ cusEnt })) return false;
	if (isUnlimitedCusEnt(cusEnt)) return false;
	if (isEntityScopedCusEnt(cusEnt)) return false;
	return true;
};

/**
 * True if this cusEnt currently has overage anywhere (either on its top-level balance
 * or on any of its entity balances for entity-scoped cusEnts).
 *
 * Used as a cheap short-circuit: if no overage exists we can skip the deduction pass
 * entirely and return the full quantity as remainder.
 */
const hasAnyOverage = (cusEnt: FullCusEntWithFullCusProduct): boolean => {
	if (isEntityScopedCusEnt(cusEnt)) {
		for (const entity of Object.values(cusEnt.entities ?? {})) {
			if ((entity.balance ?? 0) < 0) return true;
		}
		return false;
	}

	return (cusEnt.balance ?? 0) < 0;
};

/**
 * Distribute an auto top-up `quantity` across the customer's cusEnts in two conceptual steps:
 *   1. Pay down any existing overage (negative balances) on non-prepaid cusEnts first — each
 *      cusEnt is lifted up to, but not past, zero.
 *   2. Return whatever is left over as `remainder`, which the caller routes to the prepaid
 *      one-off cusEnt as a plain +remainder balance change.
 *
 * This means when the customer is blasting through usage and goes into overage, the top-up
 * first heals the overage (where it was accrued) before adding new prepaid credit — instead
 * of letting the overage sit while the prepaid bucket grows independently.
 *
 * Implementation note: reuses `runDeductionPass` with `amountToDeduct: -quantity` and
 * `maxBalance: 0` — the exact semantics of "refund, but cap each cusEnt at zero." The
 * resulting plan is emitted as `balanceChange` deltas so execution applies against the live
 * balance instead of overwriting a stale snapshot. Mutation logs are discarded because ATU
 * historically doesn't emit balance-mutation audit entries.
 */
export const rebalanceAutoTopUpOverages = ({
	customerEntitlements,
	prepaidCustomerEntitlement,
	quantity,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	prepaidCustomerEntitlement: FullCusEntWithFullCusProduct;
	quantity: number;
}): {
	paydownUpdates: UpdateCustomerEntitlement[];
	remainder: number;
} => {
	if (quantity <= 0) {
		return { paydownUpdates: [], remainder: 0 };
	}

	// 1. Filter to paydown-eligible cusEnts:
	//    - Exclude the prepaid target itself (it's where the remainder goes, not paydown).
	//    - Exclude boolean, unlimited, and entity-scoped cusEnts.
	//      Entity-scoped paydown would require entity-level delta execution to avoid
	//      stale-snapshot overwrites in this async workflow.
	//    - Keep only cusEnts actually in overage somewhere.
	const candidates = customerEntitlements.filter(
		(cusEnt) =>
			cusEnt.id !== prepaidCustomerEntitlement.id &&
			isPaydownCandidate(cusEnt) &&
			hasAnyOverage(cusEnt),
	);

	if (candidates.length === 0) {
		return { paydownUpdates: [], remainder: quantity };
	}

	const sortedCandidates = sortForPaydown(candidates);

	// 2. Run a single deduction pass as a refund (negative amount) with maxBalance: 0.
	//    This is the "paydown primitive": each cusEnt is healed up to 0, never beyond.
	const updates: DeductionUpdates = {};
	const mutationLogs: MutationLogItem[] = [];

	const passResult = runDeductionPass({
		cusEnts: sortedCandidates,
		amountToDeduct: -quantity,
		maxBalance: 0,
		updates,
		mutationLogs,
	});

	// passResult.amountToDeduct is the negative portion that couldn't be absorbed.
	// Remainder (to flow to the prepaid cusEnt) = |unabsorbed|.
	const remainder = Math.abs(passResult.amountToDeduct);

	// 3. Convert the DeductionUpdates map into deferred-safe delta updates.
	//    For refund-style passes, `deducted` is negative, so `-deducted` is the amount added
	//    back to the cusEnt balance.
	const candidatesById = new Map(
		sortedCandidates.map((cusEnt) => [cusEnt.id, cusEnt]),
	);

	const paydownUpdates: UpdateCustomerEntitlement[] = [];
	for (const [cusEntId, update] of Object.entries(updates)) {
		const cusEnt = candidatesById.get(cusEntId);
		if (!cusEnt) continue;

		const balanceChange = -update.deducted;
		if (balanceChange === 0) continue;

		paydownUpdates.push({
			customerEntitlement: cusEnt,
			balanceChange,
		});
	}

	return { paydownUpdates, remainder };
};
