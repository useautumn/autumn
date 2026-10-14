import {
	type FullCusProduct,
	isCustomerProductAddOn,
	isPrepaidPrice,
	priceToEnt,
	type SyncParamsV1,
	type SyncPlanInstance,
} from "@autumn/shared";
import type { MatchedPlan, SubscriptionMatch } from "../detect/types";
import { findLicenseQuantityDrifts } from "./findLicenseQuantityDrifts";
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
			params: SyncParamsV1 | null;
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

	const phases = params.phases ?? [];
	const phase =
		phases.find((phase) => phase.starts_at === "now") ??
		(phases.length === 1 ? phases[0] : undefined);
	if (!phase || phase.plans.length !== phaseMatch.plans.length) {
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

		if (matchedPlan.product.is_add_on === true) {
			const linkedInstances = linkedAddOnInstances({
				linkedCustomerProducts,
				syncPlan,
			});
			const desiredQuantity = syncPlan.quantity ?? 1;
			if (linkedInstances.length < desiredQuantity) {
				changedPlans.push({
					...syncPlan,
					quantity: desiredQuantity - linkedInstances.length,
					expire_previous: false,
				});
				continue;
			}

			const driftedInstance = linkedInstances.find((linkedProduct) =>
				prepaidQuantitiesDrifted({ linkedProduct, matchedPlan, syncPlan }),
			);
			if (driftedInstance) {
				changedPlans.push({ ...syncPlan });
			}
			continue;
		}

		const target = matchedPlanToTargetGroupLink({ matchedPlan, syncPlan });
		if (!target) {
			return {
				shouldSync: false,
				reason: "unsupported_target",
			};
		}

		const linkedProduct = linkedTargets.targets.get(target.key);
		const versionChanged =
			syncPlan.version !== undefined &&
			linkedProduct?.product.version !== syncPlan.version;
		if (
			!linkedProduct ||
			linkedProduct.product.id !== target.productId ||
			versionChanged
		) {
			changedPlans.push(syncPlan);
			continue;
		}

		const licenseQuantityDrifts = findLicenseQuantityDrifts({
			linkedCustomerProduct: linkedProduct,
			syncPlan,
		});
		if (licenseQuantityDrifts.length > 0) changedPlans.push(syncPlan);
	}

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
