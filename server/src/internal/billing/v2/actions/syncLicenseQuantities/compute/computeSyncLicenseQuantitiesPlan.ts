import type { CustomerLicenseUpdate } from "@autumn/shared";
import type { LicenseQuantityDrift } from "../../sync/scope/findLicenseQuantityDrifts.js";
import type {
	SyncLicenseQuantitiesParams,
	SyncLicenseQuantitiesPlan,
} from "../types.js";

/** Absolute paid count implied by the desired total; a total below the
 * pool's included count floors paid at zero. */
const driftToPaidQuantity = ({
	drift,
}: {
	drift: LicenseQuantityDrift;
}): number => {
	const { customerLicense, totalQuantity } = drift;
	const included = customerLicense.granted - customerLicense.paid_quantity;
	return Math.max(0, totalQuantity - included);
};

export const computeSyncLicenseQuantitiesPlan = ({
	params,
}: {
	params: SyncLicenseQuantitiesParams;
}): SyncLicenseQuantitiesPlan => {
	const customerLicenseUpdates: CustomerLicenseUpdate[] =
		params.licenseQuantityDrifts.map((drift) => ({
			customerLicenseId: drift.customerLicense.id,
			remainingChange: 0,
			paidQuantity: driftToPaidQuantity({ drift }),
		}));

	return {
		billingPlan: {
			customerId: params.customerId,
			insertCustomerProducts: [],
			customerLicenseUpdates,
		},
	};
};
