import type { DbCustomerLicense } from "../../../../models/licenseModels/customerLicenseTable.js";
import type { FullPlanLicense } from "../../../../models/licenseModels/fullPlanLicenseModel.js";

/** Total seat capacity: the plan license's included (free) seats plus the
 * customer's prepaid quantity. granted is always derived, never authored. */
export const customerLicenseToGranted = ({
	customerLicense,
	planLicense,
}: {
	customerLicense: Pick<DbCustomerLicense, "paid_quantity">;
	planLicense: Pick<FullPlanLicense, "included">;
}): number => planLicense.included + customerLicense.paid_quantity;
