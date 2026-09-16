import {
	type ApiPlanV1,
	diffLicensePlanCustomize,
	type Feature,
	type FullProductWithoutLicenses,
	type LicenseCustomize,
	mapToProductV2,
	productV2ToApiPlanV1,
} from "@autumn/shared";

const toApiPlanV1 = (product: FullProductWithoutLicenses): ApiPlanV1 => {
	const features: Feature[] = product.entitlements.map(
		(entitlement) => entitlement.feature,
	);
	return productV2ToApiPlanV1({
		product: mapToProductV2({ product, features }),
		features,
	});
};

/** Overlay a child product carries versus its own base version — undefined
 * when the two plans are the same. */
export const licensePlanCustomize = ({
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
