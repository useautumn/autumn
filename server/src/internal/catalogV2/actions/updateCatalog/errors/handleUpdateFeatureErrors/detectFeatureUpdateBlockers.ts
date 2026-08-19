import {
	FeatureType,
	type FeatureUpdateBlocker,
	keyToTitle,
} from "@autumn/shared";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { featureChangeFlags } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/featureChangeFlags";

const isCreditSystemSwitch = (from: FeatureType, to: FeatureType): boolean =>
	(from === FeatureType.CreditSystem && to !== FeatureType.CreditSystem) ||
	(from !== FeatureType.CreditSystem && to === FeatureType.CreditSystem);

const stateHasEntitlements = (state: FeatureState | undefined) =>
	Boolean(state && (state.has_entitlements || state.has_loose_entitlements));

const stateHasEntityFeatureEntitlements = (state: FeatureState | undefined) =>
	Boolean(
		state &&
			(state.has_entity_feature_entitlements ||
				state.has_loose_entity_feature_entitlements),
	);

/**
 * Batch twin of the live-update blocker matrix
 * (features/utils/updateFeatureUtils/detectFeatureUpdateBlockers) — same codes
 * and priority order, fed from featureStatesContext (+ projected credit ids).
 */
export const detectFeatureUpdateBlockers = ({
	updateFeaturePlan,
	takenFeatureIds,
	featureState,
	projectedCreditSystemFeatureIds,
}: {
	updateFeaturePlan: UpdateFeaturePlan;
	takenFeatureIds: Set<string>;
	featureState: FeatureState | undefined;
	/** Credit systems still referencing this feature after the batch projects. */
	projectedCreditSystemFeatureIds: string[];
}): FeatureUpdateBlocker[] => {
	const { current, next } = updateFeaturePlan;
	const { isChangingId, isChangingType, isChangingUsageType } =
		featureChangeFlags({ current, next });
	const blockers: FeatureUpdateBlocker[] = [];
	const hasCreditSystems = projectedCreditSystemFeatureIds.length > 0;

	if (isChangingType) {
		if (isCreditSystemSwitch(current.type, next.type)) {
			blockers.push({
				field: "type",
				code: "type_switch_credit_system",
				message: `Cannot change type of feature ${current.id} from ${current.type} to ${next.type}`,
			});
		}
		if (featureState?.has_customers) {
			blockers.push({
				field: "type",
				code: "attached_to_customer",
				message: `Cannot change type of feature ${current.id} because it has been attached to a customer before`,
			});
		}
		if (stateHasEntityFeatureEntitlements(featureState)) {
			blockers.push({
				field: "type",
				code: "used_as_entity_feature",
				message: `Cannot change type of feature ${current.id} because it is used in an entity feature`,
			});
		}
		if (featureState?.has_prices) {
			blockers.push({
				field: "type",
				code: "has_usage_price",
				message: `Cannot change type of feature ${current.id} because it has a usage price set`,
			});
		}
		if (hasCreditSystems) {
			blockers.push({
				field: "type",
				code: "used_in_credit_system",
				message: `Cannot change type of feature ${current.id} because it is used in a credit system`,
			});
		}
		if (
			stateHasEntitlements(featureState) &&
			(current.type === FeatureType.CreditSystem ||
				next.type === FeatureType.CreditSystem)
		) {
			blockers.push({
				field: "type",
				code: "used_in_product_credit_system",
				message: `Cannot change type from ${current.type} to ${next.type} because the feature is used in a product`,
			});
		}
	}

	if (isChangingId) {
		if (takenFeatureIds.has(next.id)) {
			blockers.push({
				field: "id",
				code: "id_already_exists",
				message: `Feature ${next.id} already exists`,
			});
		}
		if (featureState?.has_customers) {
			blockers.push({
				field: "id",
				code: "attached_to_customer",
				message: `Cannot change id of feature ${current.id} because a customer is using it or has used it before`,
			});
		}
	}

	if (isChangingUsageType && next.config?.usage_type) {
		const usageTypeTitle = keyToTitle(next.config.usage_type).toLowerCase();
		if (hasCreditSystems) {
			blockers.push({
				field: "usage_type",
				code: "used_in_credit_system",
				message: `Cannot set to ${usageTypeTitle} because it is used in credit system ${projectedCreditSystemFeatureIds[0]}`,
			});
		}
		if (stateHasEntityFeatureEntitlements(featureState)) {
			blockers.push({
				field: "usage_type",
				code: "used_as_entity_feature",
				message: `Cannot set to ${usageTypeTitle} because it is used as an entity feature`,
			});
		}
		if (featureState?.has_customers) {
			blockers.push({
				field: "usage_type",
				code: "attached_to_customer",
				message: `Cannot set to ${usageTypeTitle} because it is / was used by customers`,
			});
		}
	}

	return blockers;
};
