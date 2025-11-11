import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { nullish } from "../utils.js";

export const productToCusProduct = ({
	productId,
	cusProducts,
	internalEntityId,
	cusProductId,
	version,
	inStatuses,
}: {
	productId: string;
	cusProducts: FullCusProduct[];
	internalEntityId?: string;
	cusProductId?: string;
	version?: number;
	inStatuses?: CusProductStatus[];
}) => {
	if (cusProductId) {
		return cusProducts.find((cusProduct) => {
			const cusProductIdMatch = cusProduct.id === cusProductId;
			const versionMatch = version
				? cusProduct.product.version === version
				: true;

			const prodIdMatch = cusProduct.product.id === productId;

			const entityMatch = internalEntityId
				? cusProduct.internal_entity_id === internalEntityId
				: nullish(cusProduct.internal_entity_id);

			// const statusMatch = inStatuses
			// 	? inStatuses.includes(cusProduct.status)
			// 	: true;

			// if (cusProductIdMatch) {
			// 	console.log(`Cus Product ID Match: ${cusProductIdMatch}`);
			// 	console.log(`Version Match: ${versionMatch}`);
			// 	console.log(`Prod ID Match: ${prodIdMatch}`);
			// 	console.log(`Entity Match: ${entityMatch}`);
			// 	console.log(`--------------------------------`);
			// }

			return cusProductIdMatch && versionMatch && prodIdMatch && entityMatch;
		});
	}

	return cusProducts.find((cusProduct) => {
		const versionMatch = version
			? cusProduct.product.version === version
			: true;

		const prodIdMatch = cusProduct.product.id === productId;

		const entityMatch = internalEntityId
			? cusProduct.internal_entity_id === internalEntityId
			: nullish(cusProduct.internal_entity_id);

		const statusMatch = inStatuses
			? inStatuses.includes(cusProduct.status)
			: true;

		return prodIdMatch && entityMatch && versionMatch && statusMatch;
	});
};
