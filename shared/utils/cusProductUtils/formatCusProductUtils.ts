import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

export const logCusProducts = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}) => {
	console.log(`CUS PRODUCTS:`);
	for (const cusProduct of cusProducts) {
		console.log(`${cusProduct.product.id} - ${cusProduct.status}`);
	}
};
