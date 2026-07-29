import {
	type Feature,
	FeatureType,
	type FeatureUpdateBlocker,
	keyToTitle,
	notNullish,
} from "@autumn/shared";
import type { ObjectsUsingFeature } from "./getObjectsUsingFeature.js";

const isCreditSystemSwitch = (from: FeatureType, to: FeatureType): boolean =>
	(from === FeatureType.CreditSystem && to !== FeatureType.CreditSystem) ||
	(from !== FeatureType.CreditSystem && to === FeatureType.CreditSystem);

/** Whether a change touches the dimensions (type/id/usage_type) that can block. */
export const isBlockableFeatureChange = ({
	feature,
	updates,
}: {
	feature: Feature;
	updates: Partial<Feature>;
}): boolean => {
	const isChangingType =
		notNullish(updates.type) && feature.type !== updates.type;
	const isChangingId = notNullish(updates.id) && feature.id !== updates.id;
	const isChangingUsageType =
		feature.type !== FeatureType.Boolean &&
		updates.type !== FeatureType.Boolean &&
		feature.config?.usage_type !== updates.config?.usage_type;
	return isChangingType || isChangingId || isChangingUsageType;
};

/**
 * Read-only detection of every condition that would make `updateFeature` reject
 * the change, in the same priority order it throws. Shared by the live update
 * path and `catalog.preview_update` so the two never drift.
 */
export const detectFeatureUpdateBlockers = ({
	feature,
	updates,
	objectsUsingFeature,
	allFeatures,
}: {
	feature: Feature;
	updates: Partial<Feature>;
	objectsUsingFeature: ObjectsUsingFeature;
	allFeatures: Feature[];
}): FeatureUpdateBlocker[] => {
	const { entitlements, prices, creditSystems, linkedEntitlements, cusEnts } =
		objectsUsingFeature;
	const blockers: FeatureUpdateBlocker[] = [];

	const isChangingType =
		notNullish(updates.type) && feature.type !== updates.type;
	const isChangingId = notNullish(updates.id) && feature.id !== updates.id;
	const isChangingUsageType =
		feature.type !== FeatureType.Boolean &&
		updates.type !== FeatureType.Boolean &&
		feature.config?.usage_type !== updates.config?.usage_type;

	if (isChangingType && updates.type) {
		const newType = updates.type;
		if (isCreditSystemSwitch(feature.type, newType)) {
			blockers.push({
				field: "type",
				code: "type_switch_credit_system",
				message: `Cannot change type of feature ${feature.id} from ${feature.type} to ${newType}`,
			});
		}
		if (cusEnts.length > 0) {
			blockers.push({
				field: "type",
				code: "attached_to_customer",
				message: `Cannot change type of feature ${feature.id} because it has been attached to a customer before`,
			});
		}
		if (linkedEntitlements.length > 0) {
			blockers.push({
				field: "type",
				code: "used_as_entity_feature",
				message: `Cannot change type of feature ${feature.id} because it is used in an entity feature by ${linkedEntitlements[0].feature.name}`,
			});
		}
		if (prices.length > 0) {
			blockers.push({
				field: "type",
				code: "has_usage_price",
				message: `Cannot change type of feature ${feature.id} because it has a usage price set`,
			});
		}
		if (creditSystems.length > 0) {
			blockers.push({
				field: "type",
				code: "used_in_credit_system",
				message: `Cannot change type of feature ${feature.id} because it is used in a credit system`,
			});
		}
		if (
			entitlements.length > 0 &&
			(feature.type === FeatureType.CreditSystem ||
				newType === FeatureType.CreditSystem)
		) {
			blockers.push({
				field: "type",
				code: "used_in_product_credit_system",
				message: `Cannot change type from ${feature.type} to ${newType} because the feature is used in a product`,
			});
		}
	}

	if (isChangingId && updates.id) {
		const newId = updates.id;
		if (allFeatures.some((other) => other.id === newId)) {
			blockers.push({
				field: "id",
				code: "id_already_exists",
				message: `Feature ${newId} already exists`,
			});
		}
		if (cusEnts.length > 0) {
			blockers.push({
				field: "id",
				code: "attached_to_customer",
				message: `Cannot change id of feature ${feature.id} because a customer is using it or has used it before`,
			});
		}
	}

	if (isChangingUsageType && updates.config?.usage_type) {
		const usageTypeTitle = keyToTitle(updates.config.usage_type).toLowerCase();
		if (creditSystems.length > 0) {
			blockers.push({
				field: "usage_type",
				code: "used_in_credit_system",
				message: `Cannot set to ${usageTypeTitle} because it is used in credit system ${creditSystems[0].id}`,
			});
		}
		if (linkedEntitlements.length > 0) {
			blockers.push({
				field: "usage_type",
				code: "used_as_entity_feature",
				message: `Cannot set to ${usageTypeTitle} because it is used as an entity by ${linkedEntitlements[0].feature.name}`,
			});
		}
		if (cusEnts.length > 0) {
			blockers.push({
				field: "usage_type",
				code: "attached_to_customer",
				message: `Cannot set to ${usageTypeTitle} because it is / was used by customers`,
			});
		}
	}

	return blockers;
};
