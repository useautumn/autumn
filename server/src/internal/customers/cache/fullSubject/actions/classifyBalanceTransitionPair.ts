import type {
	BalanceTransition,
	FullCustomerEntitlement,
	NormalizedFullSubject,
} from "@autumn/shared";

export type BalanceCandidate =
	| FullCustomerEntitlement
	| NormalizedFullSubject["customer_entitlements"][number];

export type BalanceTransitionPairUnsupportedReason =
	| "complex_runtime_state"
	| "duplicate_source_customer_entitlement"
	| "duplicate_target_customer_entitlement"
	| "feature_mismatch"
	| "internal_feature_mismatch"
	| "missing_source_customer_entitlement"
	| "missing_target_customer_entitlement"
	| "source_snapshot_mismatch";

const isSimpleBalance = (customerEntitlement: BalanceCandidate): boolean =>
	typeof customerEntitlement.balance === "number" &&
	Number.isFinite(customerEntitlement.balance) &&
	Number.isFinite(customerEntitlement.adjustment ?? 0) &&
	(customerEntitlement.additional_balance ?? 0) === 0 &&
	!customerEntitlement.is_pooled_balance &&
	!customerEntitlement.pooled_balance_id &&
	!customerEntitlement.pooled_contribution_id &&
	!customerEntitlement.internal_entity_id &&
	!customerEntitlement.entitlement?.entity_feature_id &&
	Object.keys(customerEntitlement.entities ?? {}).length === 0 &&
	(customerEntitlement.rollovers?.length ?? 0) === 0 &&
	(customerEntitlement.replaceables?.length ?? 0) === 0;

export const classifyBalanceTransitionPair = ({
	transition,
	sourceCustomerEntitlement,
	targetCustomerEntitlement,
	sourceAlreadyUsed,
	targetAlreadyUsed,
}: {
	transition: BalanceTransition;
	sourceCustomerEntitlement?: BalanceCandidate;
	targetCustomerEntitlement?: BalanceCandidate;
	sourceAlreadyUsed: boolean;
	targetAlreadyUsed: boolean;
}): BalanceTransitionPairUnsupportedReason | undefined => {
	if (!sourceCustomerEntitlement) return "missing_source_customer_entitlement";
	if (!targetCustomerEntitlement) return "missing_target_customer_entitlement";
	if (sourceAlreadyUsed) return "duplicate_source_customer_entitlement";
	if (targetAlreadyUsed) return "duplicate_target_customer_entitlement";
	if (
		sourceCustomerEntitlement.feature_id !==
		targetCustomerEntitlement.feature_id
	) {
		return "feature_mismatch";
	}
	if (
		sourceCustomerEntitlement.internal_feature_id &&
		targetCustomerEntitlement.internal_feature_id &&
		sourceCustomerEntitlement.internal_feature_id !==
			targetCustomerEntitlement.internal_feature_id
	) {
		return "internal_feature_mismatch";
	}
	if (
		!isSimpleBalance(sourceCustomerEntitlement) ||
		!isSimpleBalance(targetCustomerEntitlement)
	) {
		return "complex_runtime_state";
	}
	if (
		transition.sourceBalance !== sourceCustomerEntitlement.balance ||
		transition.sourceAdjustment !== (sourceCustomerEntitlement.adjustment ?? 0)
	) {
		return "source_snapshot_mismatch";
	}

	return undefined;
};
