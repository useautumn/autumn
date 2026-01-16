import { InternalError } from "@autumn/shared";
import type { Feature } from "@models/featureModels/featureModels";
import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";

export function findCustomerEntitlementByFeature<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>(params: {
	cusEnts: T[];
	internalFeatureId?: string;
	featureId?: string;
	feature?: Feature;
	errorOnNotFound: true;
}): T;

export function findCustomerEntitlementByFeature<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>(params: {
	cusEnts: T[];
	internalFeatureId?: string;
	featureId?: string;
	feature?: Feature;
	errorOnNotFound?: false;
}): T | undefined;

export function findCustomerEntitlementByFeature<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>({
	cusEnts,
	internalFeatureId,
	featureId,
	feature,
	errorOnNotFound = false,
}: {
	cusEnts: T[];
	internalFeatureId?: string;
	featureId?: string;
	feature?: Feature;
	errorOnNotFound?: boolean;
}): T | undefined {
	const cusEnt = cusEnts.find((ce) => {
		if (internalFeatureId && ce.internal_feature_id === internalFeatureId) {
			return true;
		}
		if (
			featureId &&
			(ce.entitlement.feature_id === featureId ||
				ce.feature_id === featureId)
		) {
			return true;
		}
		if (
			feature &&
			(ce.entitlement.feature.id === feature.id ||
				ce.entitlement.feature.internal_id === feature.internal_id)
		) {
			return true;
		}
		return false;
	});

	if (!cusEnt && errorOnNotFound) {
		const identifier =
			internalFeatureId || featureId || feature?.id || feature?.internal_id;
		throw new InternalError({
			message: `[findCustomerEntitlementByFeature] Customer entitlement not found for feature: ${identifier}`,
		});
	}

	return cusEnt;
}
