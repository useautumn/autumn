import type { DbCustomerLicense } from "../../../../models/licenseModels/customerLicenseTable.js";

/** Live seat count from the maintained counters — never COUNT over seats. */
export const customerLicenseToUsed = ({
	customerLicense,
}: {
	customerLicense: Pick<DbCustomerLicense, "granted" | "remaining">;
}): number => customerLicense.granted - customerLicense.remaining;
