import {
	type ApiPlanLicenseV1,
	type Feature,
	type FullProduct,
	mapToProductV2,
	type PlanLicense,
} from "@autumn/shared";

export const buildProductDataCatalogLicenses = ({
	product,
	apiLicenses = [],
	features,
}: {
	product: FullProduct;
	apiLicenses?: ApiPlanLicenseV1[];
	features: Feature[];
}) => {
	const apiLicenseByPlanId = new Map(
		apiLicenses.map((license) => [license.license_plan_id, license]),
	);

	return (product.licenses ?? []).flatMap((license) => {
		const apiLicense = apiLicenseByPlanId.get(license.product.id);
		if (!apiLicense) return [];

		const planLicense: PlanLicense = {
			id: license.id,
			parent_plan_id: product.id,
			license_plan_id: apiLicense.license_plan_id,
			included: apiLicense.included,
			prepaid_only: apiLicense.prepaid_only,
			customize: apiLicense.customize ?? null,
			metadata: license.metadata,
			created_at: license.created_at,
			updated_at: license.updated_at,
		};

		return [
			{
				planLicense,
				license: mapToProductV2({
					product: license.base_product ?? license.product,
					features,
				}),
			},
		];
	});
};
