import type { Checkout } from "@autumn/shared";

export const getAdjustableFeatureIds = ({
	checkout,
}: {
	checkout: Checkout;
}): string[] => {
	if (!("feature_quantities" in checkout.params)) return [];
	return (
		checkout.params.feature_quantities
			?.filter((fq) => fq.adjustable === true)
			.map((fq) => fq.feature_id) ?? []
	);
};
