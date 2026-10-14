import type { FullCusProduct } from "@autumn/shared";

export const isCustomerProductActiveDuringPeriod = ({
	customerProduct,
	startMs,
	endMs,
}: {
	customerProduct: FullCusProduct;
	startMs: number;
	endMs: number | undefined;
}): boolean => {
	const productStartsAt = customerProduct.starts_at;
	const productEndedAt = customerProduct.ended_at;

	const startsBeforePeriodEnds = endMs ? productStartsAt < endMs : true;
	const endsAfterPeriodStarts = productEndedAt
		? productEndedAt > startMs
		: true;

	return startsBeforePeriodEnds && endsAfterPeriodStarts;
};
