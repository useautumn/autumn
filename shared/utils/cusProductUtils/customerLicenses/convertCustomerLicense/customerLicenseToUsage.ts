import type { DbCustomerLicense } from "../../../../models/licenseModels/customerLicenseTable.js";

export const customerLicenseToUsage = ({
	customerLicense,
}: {
	customerLicense: Pick<DbCustomerLicense, "granted" | "remaining">;
}): number => customerLicense.granted - customerLicense.remaining;
