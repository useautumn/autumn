import {
	type FullCusProduct,
	isCustomerProductAddOn,
	isPrepaidPrice,
	priceToEnt,
	type SyncParamsV1,
	type SyncPlanInstance,
} from "@autumn/shared";
import type { MatchedPlan, SubscriptionMatch } from "../detect/types";
import {
	linkedCustomerProductsToTargetGroupMap,
	matchedPlanToTargetGroupLink,
} from "./targetGroupLinks";

export type IncrementalSyncSkipReason =
	| "no_current_phase"
	| "unsupported_phase_shape"
	| "unsupported_target"
	| "ambiguous_linked_targets"
	| "no_changed_targets";

export type IncrementalSyncParamsResult =
	| {
			shouldSync: true;
			/** Null when the only change is removals (nothing to re-attach). */
			params: SyncParamsV1 | null;
			/** Linked add-on cusProducts whose Stripe items were removed. */
			removedCustomerProducts: FullCusProduct[];
	  }
	| { shouldSync: false; reason: IncrementalSyncSkipReason };

const currentPhase = ({ match }: { match: SubscriptionMatch }) =>
	match.phaseMatches.find((phase) => phase.is_current) ?? null;

const matchedPlansByProductId = ({
	matchedPlans,
}: {
	matchedPlans: MatchedPlan[];
}):
	| { ok: true; plansByProductId: Map<string, MatchedPlan> }
	| { ok: false } => {
	const plansByProductId = new Map<string, MatchedPlan>();

	for (const matchedPlan of matchedPlans) {
		const productId = matchedPlan.product.id;
		if (plansByProductId.has(productId)) {
			return { ok: false };
		}
		plansByProductId.set(productId, matchedPlan);
	}

	return { ok: true, plansByProductId };
};

/** Active linked cusProducts for this add-on plan — one row per purchased instance. */
const linkedAddOnInstances = ({
	linkedCustomerProducts,
	syncPlan,
}: {
	linkedCustomerProducts: FullCusProduct[];
	syncPlan: SyncPlanInstance;
}) =>
	linkedCustomerProducts.filter((linkedProduct) => {
		if (!isCustomerProductAddOn(linkedProduct)) return false;
		if (linkedProduct.product.id !== syncPlan.plan_id) return false;
		return syncPlan.entity_id
			? linkedProduct.internal_entity_id === syncPlan.entity_id
			: !linkedProduct.internal_entity_id;
	});

/** Current API-side prepaid totals (packs × billing_units + allowance). */
const linkedPrepaidFeatureTotals = ({
	linkedProduct,
	matchedPlan,
}: {
	linkedProduct: FullCusProduct;
	matchedPlan: MatchedPlan;
}): Map<string, number> => {
	const totals = new Map<string, number>();
	for (const price of matchedPlan.product.prices) {
		if (!isPrepaidPrice(price)) continue;
		const entitlement = priceToEnt({
			price,
			entitlements: matchedPlan.product.entitlements,
		});
		if (!entitlement) continue;

		const option = linkedProduct.options?.find(
			(o) => o.feature_id === entitlement.feature.id,
		);
		const packs = option?.quantity ?? 0;
		const billingUnits = price.config.billing_units ?? 1;
		const allowance = entitlement.allowance ?? 0;
		totals.set(entitlement.feature.id, packs * billingUnits + allowance);
	}
	return totals;
};

const prepaidQuantitiesDrifted = ({
	linkedProduct,
	matchedPlan,
	syncPlan,
}: {
	linkedProduct: FullCusProduct;
	matchedPlan: MatchedPlan;
	syncPlan: SyncPlanInstance;
}): boolean => {
	const currentTotals = linkedPrepaidFeatureTotals({
		linkedProduct,
		matchedPlan,
	});
	if (currentTotals.size === 0) return false;

	for (const [featureId, currentTotal] of currentTotals) {
		const desired = syncPlan.feature_quantities?.find(
			(fq) => fq.feature_id === featureId,
		);
		if ((desired?.quantity ?? 0) !== currentTotal) return true;
	}
	return false;
};

export const buildIncrementalSyncParams = ({
	match,
	params,
	linkedCustomerProducts,
}: {
	match: SubscriptionMatch;
	params: SyncParamsV1;
	linkedCustomerProducts: FullCusProduct[];
}): IncrementalSyncParamsResult => {
	const phaseMatch = currentPhase({ match });
	if (!phaseMatch) {
		return {
			shouldSync: false,
			reason: "no_current_phase",
		};
	}

	const phase = params.phases?.[0];
	if (
		!phase ||
		params.phases?.length !== 1 ||
		phase.plans.length !== phaseMatch.plans.length
	) {
		return {
			shouldSync: false,
			reason: "unsupported_phase_shape",
		};
	}

	const linkedTargets = linkedCustomerProductsToTargetGroupMap({
		linkedCustomerProducts,
	});
	if (!linkedTargets.ok) {
		return {
			shouldSync: false,
			reason: "ambiguous_linked_targets",
		};
	}

	const matchedPlanMap = matchedPlansByProductId({
		matchedPlans: phaseMatch.plans,
	});
	if (!matchedPlanMap.ok) {
		return {
			shouldSync: false,
			reason: "unsupported_target",
		};
	}

	const changedPlans: SyncPlanInstance[] = [];
	for (const syncPlan of phase.plans) {
		const matchedPlan = matchedPlanMap.plansByProductId.get(syncPlan.plan_id);
		if (!matchedPlan) {
			return {
				shouldSync: false,
				reason: "unsupported_target",
			};
		}

		// Add-ons: syncPlan.quantity is the plan-INSTANCE count (rollup derives it
		// from the base item's Stripe quantity, never from prepaid items —
		// prepaid pack counts live in syncPlan.feature_quantities instead).
		if (matchedPlan.product.is_add_on === true) {
			const linkedInstances = linkedAddOnInstances({
				linkedCustomerProducts,
				syncPlan,
			});
			const desiredQuantity = syncPlan.quantity ?? 1;
			if (linkedInstances.length < desiredQuantity) {
				// Fewer instances linked than Stripe shows — attach only the missing
				// ones; expire_previous: false so existing instances survive.
				changedPlans.push({
					...syncPlan,
					quantity: desiredQuantity - linkedInstances.length,
					expire_previous: false,
				});
				continue;
			}

			// Same instance count but prepaid packs drifted — push the syncPlan
			// unmodified (expire_previous: true) so syncV2 expire+replaces with usage carry.
			const driftedInstance = linkedInstances.find((linkedProduct) =>
				prepaidQuantitiesDrifted({ linkedProduct, matchedPlan, syncPlan }),
			);
			if (driftedInstance) {
				changedPlans.push({ ...syncPlan });
			}
			continue;
		}

		// Main plans re-sync only when the linked target's product id changed
		// (upgrade/downgrade); prepaid drift is not checked for them here.
		const target = matchedPlanToTargetGroupLink({ matchedPlan, syncPlan });
		if (!target) {
			return {
				shouldSync: false,
				reason: "unsupported_target",
			};
		}

		const linkedProduct = linkedTargets.targets.get(target.key);
		if (!linkedProduct || linkedProduct.product.id !== target.productId) {
			changedPlans.push(syncPlan);
		}
	}

	// Linked add-ons whose Stripe items disappeared from the sub get expired.
	// Removal of MAIN linked products may get the same handling in the future.
	// An unmatched item_diff means detection failed to classify something
	// still on the subscription (e.g. the tiered-prepaid enrichment gap) —
	// that's a detection miss, not proof of removal, so skip expiring
	// anything this phase to avoid dropping a live entitlement.
	const hasUnmatchedItems = phaseMatch.item_diffs.some(
		(diff) => diff.match.kind === "none",
	);
	const matchedPlanIds = new Set(
		phaseMatch.plans.map((matchedPlan) => matchedPlan.product.id),
	);
	const removedCustomerProducts = hasUnmatchedItems
		? []
		: linkedCustomerProducts.filter(
				(linkedProduct) =>
					isCustomerProductAddOn(linkedProduct) &&
					!matchedPlanIds.has(linkedProduct.product.id),
			);

	if (changedPlans.length === 0 && removedCustomerProducts.length === 0) {
		return {
			shouldSync: false,
			reason: "no_changed_targets",
		};
	}

	return {
		shouldSync: true,
		params:
			changedPlans.length > 0
				? { ...params, phases: [{ ...phase, plans: changedPlans }] }
				: null,
		removedCustomerProducts,
	};
};
