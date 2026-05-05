import type { Checkout } from "@autumn/shared";

/**
 * Returns the feature IDs the customer can adjust at checkout.
 *
 * Opt-in: merchants must explicitly set `adjustable: true` on each
 * `feature_quantities[]` entry at attach time.
 */
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
