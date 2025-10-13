import {
	type AttachBody,
	type AttachBranch,
	isUsagePrice,
	notNullish,
	nullish,
	type Price,
} from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleMultiAttachErrors = async ({
	attachParams,
	attachBody,
	branch,
}: {
	attachParams: AttachParams;
	attachBody: AttachBody;
	branch: AttachBranch;
}) => {
	const { products, prices, productsList } = attachParams;

	const usagePrice = prices.find((p: Price) => isUsagePrice({ price: p }));

	// 1. Don't support usage prices just yet...
	if (usagePrice) {
		const product = products.find(
			(p) => p.internal_id === usagePrice.internal_product_id,
		);
		throw new RecaseError({
			code: "invalid_inputs",
			message: `The 'products' parameter doesn't support prices that are variable (usage-based) at the moment. The product ${product?.name} contains this.`,
		});
	}

	// If there are multiple products...
	const cusProducts = attachParams.customer.customer_products;
	for (const prodOptions of productsList!) {
		const newQuantity = prodOptions.quantity || 1;
		const curCusQuantity =
			cusProducts.find(
				(cp) =>
					cp.product_id === prodOptions.product_id &&
					nullish(cp.internal_entity_id),
			)?.quantity || 0;

		const curEntityQuantity =
			cusProducts.filter(
				(cp) =>
					cp.product_id === prodOptions.product_id &&
					notNullish(cp.internal_entity_id),
			)?.length || 0;

		if (newQuantity < curEntityQuantity) {
			throw new RecaseError({
				code: "invalid_inputs",
				message: `Product ${prodOptions.product_id} is assigned to ${curEntityQuantity} entities and therefore can't be decreased to ${newQuantity}.`,
			});
		}
	}
};
