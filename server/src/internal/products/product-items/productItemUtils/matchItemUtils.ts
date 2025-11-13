import type { Entitlement, Price, ProductItem } from "@autumn/shared";

export const matchItemToPriceAndEnt = ({
	item,
	curPrices,
	curEnts,
}: {
	item: ProductItem;
	curPrices: Price[];
	curEnts: Entitlement[];
}) => {
	// return items.find(
	// 	(i) => i.feature_id === item.feature_id && i.interval === item.interval,
	// );
};
