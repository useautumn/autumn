import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";

export const matchItemToPriceAndEnt = ({
	item,
	curPrices,
	curEnts,
	taken,
}: {
	item: ProductItem;
	curPrices: Price[];
	curEnts: Entitlement[];
	taken: Set<string>;
}) => {
	const leftEnts = curEnts.filter((ent) => !taken.has(ent.id));
	const leftPrices = curPrices.filter((price) => !taken.has(price.id));

	// return items.find(
	// 	(i) => i.feature_id === item.feature_id && i.interval === item.interval,
	// );
};
