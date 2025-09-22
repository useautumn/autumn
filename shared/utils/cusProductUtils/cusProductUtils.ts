import { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { notNullish } from "../utils.js";

export const getTotalCusProdQuantity = ({
	cusProducts,
	productId,
}: {
	cusProducts: FullCusProduct[];
	productId: string;
}) => {
	return cusProducts
		.filter((cp) => cp.product_id === productId)
		.reduce((acc, curr) => {
			if (notNullish(curr.internal_entity_id)) {
				return acc + 1;
			} else {
				return acc + (curr.quantity || 1);
			}
		}, 0);
};

export const getCusProductMinQuantity = ({
	cusProducts,
	productId,
}: {
	cusProducts: FullCusProduct[];
	productId: string;
}) => {
	return (
		cusProducts.filter(
			(cp) => cp.product_id === productId && notNullish(cp.internal_entity_id),
		).length || 0
	);
};
