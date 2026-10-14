import type { ApiPlanLicenseV1 } from "@api/products/apiPlanLicenseV1";
import type { FullProduct } from "@models/productModels/productModels";
import { fullProductsToLicenseCustomize } from "@utils/planV1Utils/licenses/fullProductsToLicenseCustomize";

export const fullPlanLicensesToApiPlanLicenses = ({
	licenses,
}: {
	licenses: NonNullable<FullProduct["licenses"]>;
}): ApiPlanLicenseV1[] =>
	licenses.map((license) => {
		const customize =
			license.customized && license.base_product
				? fullProductsToLicenseCustomize({
						product: license.product,
						baseProduct: license.base_product,
					})
				: undefined;
		return {
			license_plan_id: license.product.id,
			version: license.product.version,
			...(license.product.version_slug
				? { version_slug: license.product.version_slug }
				: {}),
			included: license.included,
			prepaid_only: license.prepaid_only,
			...(customize ? { customize } : {}),
			...(license.metadata && Object.keys(license.metadata).length > 0
				? { metadata: license.metadata }
				: {}),
		};
	});
