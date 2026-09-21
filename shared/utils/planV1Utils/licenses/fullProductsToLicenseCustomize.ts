import type { ApiPlanV1 } from "@api/products/apiPlanV1";
import type { Feature } from "@models/featureModels/featureModels";
import type { LicenseCustomize } from "@models/licenseModels/licenseModels";
import type { FullProductWithoutLicenses } from "@models/productModels/productModels";
import { mapToProductV2 } from "@utils/productV2Utils/mapToProductV2";
import { productV2ToApiPlanV1 } from "@utils/productV2Utils/productV2ToApiPlanV1";
import { diffLicensePlanCustomize } from "./diffLicensePlanCustomize";

const toApiPlanV1 = (product: FullProductWithoutLicenses): ApiPlanV1 => {
	const features: Feature[] = product.entitlements.map(
		(entitlement) => entitlement.feature,
	);
	return productV2ToApiPlanV1({
		product: mapToProductV2({ product, features }),
		features,
		includeProration: true,
	});
};

/** The overlay a license's product carries over its own base version; undefined when the two plans are the same. */
export const fullProductsToLicenseCustomize = ({
	product,
	baseProduct,
}: {
	product: FullProductWithoutLicenses;
	baseProduct: FullProductWithoutLicenses;
}): LicenseCustomize | undefined =>
	diffLicensePlanCustomize({
		basePlan: toApiPlanV1(baseProduct),
		effectivePlan: toApiPlanV1(product),
	});
