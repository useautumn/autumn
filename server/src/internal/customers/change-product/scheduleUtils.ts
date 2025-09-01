import type { FullCusProduct } from "@autumn/shared";

export const getPricesForCusProduct = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	if (!cusProduct) {
		return [];
	}
	return cusProduct.customer_prices.map((price) => price.price);
};

export const getScheduleIdsFromCusProducts = ({
	cusProducts,
}: {
	cusProducts: (FullCusProduct | null | undefined)[];
}) => {
	let scheduleIds: string[] = [];
	for (const cusProduct of cusProducts) {
		if (cusProduct) {
			scheduleIds = scheduleIds.concat(cusProduct.scheduled_ids || []);
		}
	}
	return scheduleIds;
};
