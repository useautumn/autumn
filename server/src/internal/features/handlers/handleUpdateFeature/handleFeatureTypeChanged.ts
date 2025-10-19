import {
	AllowanceType,
	EntInterval,
	ErrCode,
	type Feature,
	FeatureType,
	RecaseError,
} from "@autumn/shared";
import { db } from "@/db/initDrizzle.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { ObjectsUsingFeature } from "./getObjectsUsingFeature.js";

export const handleFeatureTypeChanged = async ({
	objectsUsingFeature,
	feature,
	newType,
}: {
	ctx: ExtendedRequest;
	objectsUsingFeature: ObjectsUsingFeature;
	feature: Feature;
	newType: FeatureType;
}) => {
	const { linkedEntitlements, entitlements, prices, creditSystems, cusEnts } =
		objectsUsingFeature;

	if (cusEnts.length > 0) {
		throw new RecaseError({
			message: `Cannot change type of feature ${feature.id} because it has been attached to a customer before`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// 1. Check linked entitlements
	if (linkedEntitlements.length > 0) {
		throw new RecaseError({
			message: `Cannot change type of feature ${feature.id} because it is used in an entity feature by ${linkedEntitlements[0].feature.name}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (prices.length > 0) {
		throw new RecaseError({
			message: `Cannot change type of feature ${feature.id} because it has a usage price set`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (creditSystems.length > 0) {
		throw new RecaseError({
			message: `Cannot change type of feature ${feature.id} because it is used in a credit system`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (entitlements.length > 0) {
		// 1. Check if either type is credit_system
		if (
			feature.type === FeatureType.CreditSystem ||
			newType === FeatureType.CreditSystem
		) {
			throw new RecaseError({
				message: `Cannot change type from ${feature.type} to ${newType} because the feature is used in a product`,
				code: ErrCode.InvalidFeature,
				statusCode: 400,
			});
		}

		// 2. Handle boolean -> metered conversion
		if (
			feature.type === FeatureType.Boolean &&
			newType === FeatureType.Metered
		) {
			await Promise.all(
				entitlements.map((entitlement) =>
					EntitlementService.update({
						db,
						id: entitlement.id,
						updates: {
							allowance_type: AllowanceType.Unlimited,
							allowance: null,
							interval: EntInterval.Lifetime,
							carry_from_previous: false,
						},
					}),
				),
			);
		}

		// 2b. Handle metered -> boolean conversion
		if (
			feature.type === FeatureType.Metered &&
			newType === FeatureType.Boolean
		) {
			await Promise.all(
				entitlements.map((entitlement) =>
					EntitlementService.update({
						db,
						id: entitlement.id,
						updates: {
							allowance_type: null,
							allowance: null,
							interval: null,
							entity_feature_id: null,
							carry_from_previous: false,
						},
					}),
				),
			);
		}
	}
};
