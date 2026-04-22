import {
	ACTIVE_STATUSES,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runDeductionPass } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript.js";
import type { DeductionUpdates } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";

/**
 * Input intent captured at compute time on the AutumnBillingPlan.
 */
export type AutoTopupRebalanceIntent = {
	featureId: string;
	quantity: number;
	prepaidCustomerEntitlementId: string;
};

/**
 * Sort order for paydown. Mirrors deductFromCusEntsTypescript's pass-2 sort so overage
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

/**
 * True if this cusEnt can participate in top-level paydown via a race-safe delta update.
 *   - Boolean / unlimited cusEnts: no mutable numeric balance.
 *   - Entity-scoped cusEnts: entity balances live in a JSONB map with no atomic per-entity
 *     increment primitive today; snapshot-style writes would reintroduce the P0 race.
 */
const isPaydownCandidate = (cusEnt: FullCusEntWithFullCusProduct): boolean => {
	if (isBooleanCusEnt({ cusEnt })) return false;
	if (isUnlimitedCusEnt(cusEnt)) return false;
	if (isEntityScopedCusEnt(cusEnt)) return false;
	return true;
};

/**
 * True iff the cusEnt's top-level balance is currently negative (overage).
 */
const hasTopLevelOverage = (cusEnt: FullCusEntWithFullCusProduct): boolean =>
	(cusEnt.balance ?? 0) < 0;

/**
 * Fetch a fresh FullCustomer from cache (falling back to DB on cache miss). This is
 * the same access pattern used by setupAutoTopupContext, and matches how track
 * deductions update the cache (atomic Redis JSON.NUMINCRBY), so the view returned here
 * reflects every committed deduction that preceded this executor call.
 */
const fetchLiveFullCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer | undefined> => {
	const cached = await getCachedFullCustomer({ ctx, customerId });
	if (cached) return cached;

	return await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ACTIVE_STATUSES,
		withSubs: true,
	});
};

/**
 * Execute the auto top-up rebalance intent against the customer's LIVE cusEnt balances:
 *   1. Read a fresh FullCustomer (cache → DB fallback).
 *   2. Locate the prepaid cusEnt by ID. Bail if missing.
 *   3. Filter overage candidates (non-prepaid, non-boolean, non-unlimited,
 *      non-entity-scoped, currently in overage).
 *   4. Run `runDeductionPass` on the live candidates with `maxBalance: 0` to compute
 *      paydown per cusEnt.
 *   5. Apply paydown deltas to each touched cusEnt via `adjustBalanceDbAndCache`
 *      (atomic SQL `balance + delta` + Redis JSON.NUMINCRBY).
 *   6. Apply any remainder to the prepaid cusEnt the same way.
 *
 * Failure contract matches the existing post-Stripe `updateCustomerEntitlements` step:
 * if any write throws, the customer is charged but partial, Sentry alerts, no SQS retry.
 * Self-healing property: a subsequent ATU cycle reads live data and finishes the job.
 */
export const applyAutoTopupRebalance = async ({
	ctx,
	customerId,
	intent,
}: {
	ctx: AutumnContext;
	customerId: string;
	intent: AutoTopupRebalanceIntent;
}): Promise<void> => {
	const { logger } = ctx;
	const { featureId, quantity, prepaidCustomerEntitlementId } = intent;

	if (quantity <= 0) {
		logger.info(
			`[applyAutoTopupRebalance] quantity <= 0, skipping (featureId=${featureId})`,
		);
		return;
	}

	// 1. Live read.
	const fullCustomer = await fetchLiveFullCustomer({ ctx, customerId });

	if (!fullCustomer) {
		logger.warn(
			`[applyAutoTopupRebalance] FullCustomer not found (customerId=${customerId}); skipping rebalance`,
		);
		return;
	}

	// 2. All cusEnts for this feature on this customer, pulled from live snapshot.
	const cusEntsForFeature = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	// 3. Prepaid cusEnt by ID. If it no longer exists, we have nowhere to route the
	//    remainder and no safe way to continue — bail rather than silently dropping it.
	const prepaidCusEnt = cusEntsForFeature.find(
		(cusEnt) => cusEnt.id === prepaidCustomerEntitlementId,
	);

	if (!prepaidCusEnt) {
		logger.warn(
			`[applyAutoTopupRebalance] prepaid cusEnt ${prepaidCustomerEntitlementId} not found in live customer; skipping`,
		);
		return;
	}

	// 4. Filter overage candidates (live balances).
	const candidates = cusEntsForFeature.filter(
		(cusEnt) =>
			cusEnt.id !== prepaidCustomerEntitlementId &&
			isPaydownCandidate(cusEnt) &&
			hasTopLevelOverage(cusEnt),
	);

	let remainder = quantity;

	if (candidates.length > 0) {
		const sortedCandidates = sortForPaydown(candidates);

		// 5. Run a single deduction pass as a refund (negative amount) capped at 0 per
		//    cusEnt — the paydown primitive.
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

		// 6. Apply each paydown delta. `update.deducted` is negative on refund passes;
		//    negating gives the positive delta we hand to the atomic SQL increment.
		const candidatesById = new Map(
			sortedCandidates.map((cusEnt) => [cusEnt.id, cusEnt]),
		);

		for (const [cusEntId, update] of Object.entries(updates)) {
			if (!candidatesById.has(cusEntId)) continue;

			const delta = -update.deducted;
			if (delta === 0) continue;

			await customerEntitlementActions.adjustBalanceDbAndCache({
				ctx,
				customerId,
				cusEntId,
				delta,
			});
		}
	}

	// 7. Remainder → prepaid cusEnt. Still an atomic delta so any concurrent prepaid
	//    deduction between now and the write is preserved.
	if (remainder > 0) {
		await customerEntitlementActions.adjustBalanceDbAndCache({
			ctx,
			customerId,
			cusEntId: prepaidCusEnt.id,
			delta: remainder,
		});
	}
};
