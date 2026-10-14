import type {
	CustomerLicenseQuantity,
	FullCusProduct,
	FullProduct,
	LicenseQuantityParams,
} from "@autumn/shared";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";

export const setupUpdateLicenseQuantities = ({
	params,
	fullProduct,
	customerProduct,
}: {
	params: { license_quantities?: LicenseQuantityParams[] };
	fullProduct: FullProduct;
	customerProduct: FullCusProduct;
}): CustomerLicenseQuantity[] =>
	setupCustomerLicenseQuantityContext({
		params,
		fullProduct,
		customerProduct,
	});
