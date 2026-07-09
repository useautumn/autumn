import type {
	CustomLicenseChange,
	FullCusProduct,
	LicensePatchParams,
} from "@autumn/shared";

export const buildCustomLicenseChanges = ({
	parentCustomerProduct,
	previousParentCustomerProduct,
	licensePatch,
}: {
	parentCustomerProduct: FullCusProduct;
	previousParentCustomerProduct?: FullCusProduct;
	licensePatch?: LicensePatchParams;
}): CustomLicenseChange[] => {
	const adds = licensePatch?.add_licenses;
	const removes = licensePatch?.remove_licenses;
	if (adds === undefined && removes === undefined) return [];

	return [
		{
			parentCustomerProductId: parentCustomerProduct.id,
			previousParentCustomerProductId: previousParentCustomerProduct?.id,
			parentInternalProductId: parentCustomerProduct.internal_product_id,
			adds: adds ?? [],
			removes: removes ?? [],
		},
	];
};
