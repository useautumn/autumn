import { cusProductToProduct, type FullCusProduct } from "@autumn/shared";
import { getPricesForCusProduct } from "../scheduleUtils.js";
import type { ScheduleObj } from "./ScheduleObj.js";
export const getFilteredScheduleItems = ({
	scheduleObj,
	cusProducts,
}: {
	scheduleObj: ScheduleObj;
	cusProducts: (FullCusProduct | undefined)[];
}) => {
	const { schedule, prices } = scheduleObj;
	const scheduleItems = schedule.phases[0].items;

	let curPrices: any[] = [];
	for (const cusProduct of cusProducts) {
		if (cusProduct) {
			curPrices = curPrices.concat(getPricesForCusProduct({ cusProduct }));
		}
	}

	const products = cusProducts
		.filter((cp): cp is FullCusProduct => !!cp)
		.map((cp: FullCusProduct) => cusProductToProduct({ cusProduct: cp }));

	return scheduleItems.filter((scheduleItem: any) => {
		const stripePrice = prices.find((price) => price.id === scheduleItem.price);

		const inCurProduct =
			curPrices.some(
				(price) =>
					price.config?.stripe_price_id === scheduleItem.price ||
					price.config?.stripe_product_id === stripePrice?.product,
			) ||
			products.some(
				(product) => product.processor?.id === stripePrice?.product,
			);

		return !inCurProduct;
	});
};
