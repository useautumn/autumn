import { getPricesForCusProduct } from "../scheduleUtils.js";

import { FullCusProduct } from "@autumn/shared";
import { ScheduleObj } from "./ScheduleObj.js";
import { fullCusProductToProduct } from "../../cusProducts/cusProductUtils.js";
export const getFilteredScheduleItems = ({
	scheduleObj,
	cusProducts,
}: {
	scheduleObj: ScheduleObj;
	cusProducts: (FullCusProduct | undefined)[];
}) => {
	const { schedule, prices } = scheduleObj;
	let scheduleItems = schedule.phases[0].items;

	let curPrices: any[] = [];
	for (const cusProduct of cusProducts) {
		if (cusProduct) {
			curPrices = curPrices.concat(getPricesForCusProduct({ cusProduct }));
		}
	}

	let products = cusProducts
		.filter((cp): cp is FullCusProduct => !!cp)
		.map((cp: FullCusProduct) => fullCusProductToProduct(cp));

	return scheduleItems.filter((scheduleItem: any) => {
		let stripePrice = prices.find((price) => price.id === scheduleItem.price);

		let inCurProduct =
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
