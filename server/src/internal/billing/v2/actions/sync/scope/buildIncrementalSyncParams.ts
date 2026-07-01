import { isCustomerProductAddOn } from "@autumn/shared";
import type {
	FullCusProduct,
	SyncParamsV1,
	SyncPlanInstance,
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
	| { shouldSync: true; params: SyncParamsV1 }
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

const linkedAddOnQuantity = ({
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
	}).length;

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

		if (matchedPlan.product.is_add_on === true) {
			const linkedQuantity = linkedAddOnQuantity({
				linkedCustomerProducts,
				syncPlan,
			});
			const desiredQuantity = syncPlan.quantity ?? 1;
			if (linkedQuantity < desiredQuantity) {
				changedPlans.push({
					...syncPlan,
					quantity: desiredQuantity - linkedQuantity,
				});
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
		if (!linkedProduct || linkedProduct.product.id !== target.productId) {
			changedPlans.push(syncPlan);
		}
	}

	if (changedPlans.length === 0) {
		return {
			shouldSync: false,
			reason: "no_changed_targets",
		};
	}

	return {
		shouldSync: true,
		params: {
			...params,
			phases: [{ ...phase, plans: changedPlans }],
		},
	};
};
