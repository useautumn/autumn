import { FeatureType } from "../../../models/featureModels/featureEnums";
import {
	AllowanceType,
	type EntitlementWithFeature,
} from "../../../models/productModels/entModels/entModels";
import { EntInterval } from "../../../models/productModels/intervals/entitlementInterval";
import { notNullish } from "../../utils";

export const isBooleanEntitlement = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}) => {
	return entitlement.feature.type === FeatureType.Boolean;
};

export const isUnlimitedEntitlement = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}) => {
	return entitlement.allowance_type === AllowanceType.Unlimited;
};

export const isEntityScopedEntitlement = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}) => {
	return notNullish(entitlement.entity_feature_id);
};

export const isLifetimeEntitlement = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}) => {
	return entitlement.interval === EntInterval.Lifetime;
};
