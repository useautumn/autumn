import type { BillingParamsBaseV1 } from "@autumn/shared";

export const setupAdjustableQuantities = ({
	params,
}: {
	params: BillingParamsBaseV1;
}) => {
	return (
		params.feature_quantities
			?.filter((fq) => fq.adjustable)
			.map((fq) => fq.feature_id) ?? []
	);
};
