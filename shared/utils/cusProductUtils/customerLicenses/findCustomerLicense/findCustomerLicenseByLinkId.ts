import type { FullCustomerLicense } from "../../../../models/licenseModels/fullCustomerLicense.js";

export const findCustomerLicenseByLinkId = ({
	customerLicenses,
	customerLicenseLinkId,
}: {
	customerLicenses: FullCustomerLicense[];
	customerLicenseLinkId?: string | null;
}) =>
	customerLicenses.find(
		(customerLicense) => customerLicense.link_id === customerLicenseLinkId,
	);
