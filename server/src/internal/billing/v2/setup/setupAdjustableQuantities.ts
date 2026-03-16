import type { FeatureQuantityParamsV0 } from "@autumn/shared";

export const setupAdjustableQuantities = ({
	params,
}: {
	params: {
		feature_quantities?: FeatureQuantityParamsV0[];
	};
}) => {
	return (
		params.feature_quantities
			?.filter((fq) => fq.adjustable === true)
			.map((fq) => fq.feature_id) ?? []
	);
};
