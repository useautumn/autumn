import {
	AllowanceType,
	EntInterval,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import { db } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import type { ObjectsUsingFeature } from "./getObjectsUsingFeature.js";

/**
 * Apply the allowed boolean<->metered entitlement conversions for a type change.
 * Blocking conditions are validated upstream by detectFeatureUpdateBlockers.
 */
export const handleFeatureTypeChanged = async ({
	objectsUsingFeature,
	feature,
	newType,
}: {
	ctx: AutumnContext;
	objectsUsingFeature: ObjectsUsingFeature;
	feature: Feature;
	newType: FeatureType;
}) => {
	const { entitlements } = objectsUsingFeature;
	if (entitlements.length === 0) return;

	if (feature.type === FeatureType.Boolean && newType === FeatureType.Metered) {
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

	if (feature.type === FeatureType.Metered && newType === FeatureType.Boolean) {
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
};
