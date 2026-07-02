import type {
	AutumnBillingPlan,
	CustomizePlanLicense,
	FullCusProduct,
} from "@autumn/shared";

type CustomLicenseChanges = NonNullable<AutumnBillingPlan["customLicenses"]>;

export const buildCustomLicenseChanges = ({
	parentCustomerProduct,
	previousParentCustomerProduct,
	licenses,
}: {
	parentCustomerProduct: FullCusProduct;
	previousParentCustomerProduct?: FullCusProduct;
	licenses?: CustomizePlanLicense[];
}): CustomLicenseChanges => {
	if (licenses === undefined) return [];

	return [
		{
			parentCustomerProductId: parentCustomerProduct.id,
			previousParentCustomerProductId: previousParentCustomerProduct?.id,
			licenses,
		},
	];
};
