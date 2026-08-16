import {
	type Feature,
	type FullProductWithoutLicenses,
	mapToProductV2,
	productV2ToApiPlanV1,
} from "@autumn/shared";

export const fullProductToApiPlanV1Sync = ({
	product,
	features,
}: {
	product: FullProductWithoutLicenses;
	features?: Feature[];
}) => {
	const resolvedFeatures =
		features ?? product.entitlements.map((entitlement) => entitlement.feature);
	return productV2ToApiPlanV1({
		product: mapToProductV2({ product, features: resolvedFeatures }),
		features: resolvedFeatures,
	});
};
