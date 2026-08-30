import type { EntitlementWithFeature } from "../../../models/productModels/entModels/entModels.js";
import type { PooledBalanceIdentity } from "../../../models/pooledBalanceModels/pooledBalanceIdentity.js";
import {
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "../../productUtils/entUtils/classifyEntUtils.js";
import {
	normalizedEntitlementInterval,
	normalizedEntitlementIntervalCount,
} from "../../productUtils/entUtils/compareEnt/entsAreSame.js";
import { rolloverConfigToSignature } from "./rolloverConfigToSignature.js";

/** The entitlement-derived facets; lifecycle facets (anchor, reset mode,
 * subscription, link) complete a full PooledBalanceIdentity. */
export type EntPooledBalanceIdentity = Pick<
	PooledBalanceIdentity,
	| "internalFeatureId"
	| "unlimited"
	| "interval"
	| "intervalCount"
	| "rolloverSignature"
>;

export const entToPooledBalanceIdentity = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): EntPooledBalanceIdentity => {
	const unlimited = isUnlimitedEntitlement({ entitlement });
	const tracksBalance = !unlimited && !isBooleanEntitlement({ entitlement });

	return {
		internalFeatureId: entitlement.internal_feature_id,
		unlimited,
		interval: normalizedEntitlementInterval(entitlement),
		intervalCount: normalizedEntitlementIntervalCount(entitlement),
		rolloverSignature: rolloverConfigToSignature({
			rollover: tracksBalance ? entitlement.rollover : null,
		}),
	};
};
