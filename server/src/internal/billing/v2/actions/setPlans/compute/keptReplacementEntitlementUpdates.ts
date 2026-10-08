import {
	addCusProductToCusEnt,
	type BillingContext,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	getNextResetAt,
	isResettingEntitlement,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { computeCycleBalanceResets } from "@/internal/billing/v2/compute/computeAutumnUtils/computeCycleBalanceResets";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";
import { endsLiveTrial } from "../utils/endsLiveTrial";

/** The anchor when it's ahead, unless a sooner reset runs first; a backdated anchor already passed, so its next boundary. */
const nextResetOnAnchor = ({
	customerEntitlement,
	anchorMs,
	now,
}: {
	customerEntitlement: FullCusProduct["customer_entitlements"][number];
	anchorMs: number;
	now: number;
}) => {
	const { next_reset_at: nextResetAt, entitlement } = customerEntitlement;
	if (anchorMs > now) return Math.min(nextResetAt ?? anchorMs, anchorMs);
	if (!entitlement.interval) return nextResetAt ?? undefined;

	return getNextResetAt({
		curReset: anchorMs,
		interval: entitlement.interval,
		intervalCount: entitlement.interval_count ?? 1,
		now,
	});
};

/** Kept balances reset next on the replacement's anchor, as its first renewal bills there. */
const anchorResetUpdates = ({
	billingContext,
	customerProduct,
	anchorMs,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
	anchorMs: number;
}): UpdateCustomerEntitlement[] =>
	customerProduct.customer_entitlements
		.filter(({ entitlement }) => isResettingEntitlement({ entitlement }))
		.map((customerEntitlement) => ({
			customerEntitlement,
			updates: {
				reset_cycle_anchor: entitlementToResetCycleAnchor({
					entitlement: customerEntitlement.entitlement,
					resetCycleAnchor: anchorMs,
					now: billingContext.currentEpochMs,
				}),
				next_reset_at: nextResetOnAnchor({
					customerEntitlement,
					anchorMs,
					now: billingContext.currentEpochMs,
				}),
			},
		}));

/** Ending a trial refills its balances now, like attach, except the usage carry_over_usages keeps. */
const trialEndBalanceResets = ({
	billingContext,
	customerProduct,
	carriesUsage,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
	carriesUsage: (customerEntitlement: FullCusEntWithFullCusProduct) => boolean;
}): UpdateCustomerEntitlement[] =>
	computeCycleBalanceResets({ billingContext, customerProduct }).filter(
		({ customerEntitlement }) =>
			!carriesUsage(
				addCusProductToCusEnt({
					cusEnt: customerEntitlement,
					cusProduct: customerProduct,
				}),
			),
	);

/** The entitlement updates for plans a replacement subscription carries to its anchor. */
export const keptReplacementEntitlementUpdates = ({
	billingContext,
	keptCustomerProducts,
	carriesUsage,
}: {
	billingContext: BillingContext;
	keptCustomerProducts: FullCusProduct[];
	carriesUsage: (customerEntitlement: FullCusEntWithFullCusProduct) => boolean;
}): UpdateCustomerEntitlement[] => {
	const { billingCycleAnchorMs } = billingContext;
	if (typeof billingCycleAnchorMs !== "number") return [];

	const endsTrial = endsLiveTrial({ billingContext });
	const updatesById = new Map<string, UpdateCustomerEntitlement>();
	for (const customerProduct of keptCustomerProducts) {
		for (const update of [
			...(endsTrial
				? trialEndBalanceResets({
						billingContext,
						customerProduct,
						carriesUsage,
					})
				: []),
			...anchorResetUpdates({
				billingContext,
				customerProduct,
				anchorMs: billingCycleAnchorMs,
			}),
		]) {
			const { id } = update.customerEntitlement;
			updatesById.set(id, {
				customerEntitlement: update.customerEntitlement,
				updates: { ...updatesById.get(id)?.updates, ...update.updates },
			});
		}
	}
	return Array.from(updatesById.values());
};
