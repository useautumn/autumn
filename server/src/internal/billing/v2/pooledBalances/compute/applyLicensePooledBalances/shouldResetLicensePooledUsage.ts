import {
	type CustomerLicenseTransition,
	type EntitlementWithFeature,
	entsAreSame,
} from "@autumn/shared";
import { shouldCarryOverUsage } from "@/internal/billing/v2/utils/handleCarryOvers/shouldCarryOverUsage";

/** A plan change that alters this pooled item resets its usage, unless
 * carry-over applies. Quantity-only changes keep the same item, so keep usage. */
export const shouldResetLicensePooledUsage = ({
	transition,
	entitlement,
}: {
	transition: CustomerLicenseTransition | undefined;
	entitlement: EntitlementWithFeature;
}): boolean => {
	if (!transition) return false;

	const outgoingEntitlement =
		transition.outgoingCustomerLicense.planLicense?.product.entitlements.find(
			(candidate) =>
				candidate.pooled === true &&
				candidate.internal_feature_id === entitlement.internal_feature_id,
		);
	const itemUnchanged =
		outgoingEntitlement !== undefined &&
		entsAreSame(outgoingEntitlement, entitlement);
	if (itemUnchanged) return false;

	return !shouldCarryOverUsage({
		toEntitlement: entitlement,
		carryOverUsages: transition.carryOverUsages,
	});
};
