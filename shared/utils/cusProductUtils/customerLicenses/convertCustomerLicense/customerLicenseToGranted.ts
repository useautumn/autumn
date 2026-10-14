import type { DbCustomerLicense } from "../../../../models/licenseModels/customerLicenseTable.js";
import type { FullPlanLicense } from "../../../../models/licenseModels/fullPlanLicenseModel.js";

export const customerLicenseToGranted = ({
	customerLicense,
	planLicense,
}: {
	customerLicense: Pick<DbCustomerLicense, "paid_quantity">;
	planLicense: Pick<FullPlanLicense, "included">;
}): number => planLicense.included + customerLicense.paid_quantity;
