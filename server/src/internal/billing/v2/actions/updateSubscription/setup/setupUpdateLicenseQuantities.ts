import type {
	CustomerLicenseQuantity,
	FullCusProduct,
	FullProduct,
	LicenseQuantityParams,
} from "@autumn/shared";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";

/**
 * Update semantics: licenses absent from `license_quantities` keep their
 * current paid seats (unlike attach, where absent means zero). Carried totals
 * re-derive against the incoming definition's included count.
 */
export const setupUpdateLicenseQuantities = ({
	params,
	fullProduct,
	customerProduct,
}: {
	params: { license_quantities?: LicenseQuantityParams[] };
	fullProduct: FullProduct;
	customerProduct: FullCusProduct;
}): CustomerLicenseQuantity[] => {
	const explicit = setupCustomerLicenseQuantityContext({ params });
	const explicitLicensePlanIds = new Set(
		explicit.map((quantity) => quantity.licensePlanId),
	);

	const carried = (customerProduct.customer_licenses ?? []).flatMap((pool) => {
		const licensePlanId = pool.planLicense?.product.id;
		if (!licensePlanId || explicitLicensePlanIds.has(licensePlanId)) return [];

		const incomingLink = fullProduct.licenses?.find(
			(link) => link.product.id === licensePlanId,
		);
		if (!incomingLink) return [];

		return [
			{
				licensePlanId,
				totalQuantity: incomingLink.included + pool.paid_quantity,
			},
		];
	});

	return [...explicit, ...carried];
};
