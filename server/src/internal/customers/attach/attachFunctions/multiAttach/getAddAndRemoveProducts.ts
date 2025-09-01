import type { AttachConfig, FullCusProduct } from "@autumn/shared";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";
import { mergeItemSets } from "./mergeItemSets.js";

export const getAddAndRemoveProducts = async ({
	attachParams,
	config,
}: {
	attachParams: AttachParams;
	config: AttachConfig;
}) => {
	const productsList = attachParams.productsList!;
	const removeCusProducts: FullCusProduct[] = [];
	let itemSet: ItemSet = {
		subItems: [],
		invoiceItems: [],
		usageFeatures: [],
	};
	const expireCusProducts: FullCusProduct[] = [];
	for (const productOptions of productsList) {
		const product = attachParams.products.find(
			(p) => p.id === productOptions.product_id,
		);

		const entity = attachParams.customer.entities.find(
			(e) => e.id === productOptions.entity_id,
		);

		const { curSameProduct, curScheduledProduct } = getExistingCusProducts({
			product: product!,
			cusProducts: attachParams.customer.customer_products,
			internalEntityId: entity?.internal_id,
		});

		if (curSameProduct) {
			expireCusProducts.push(curSameProduct);
			if (!curSameProduct.product.is_add_on && curScheduledProduct) {
				removeCusProducts.push(curScheduledProduct);
			} else {
				removeCusProducts.push(curSameProduct);
			}
		}

		const newItemSet = await getStripeSubItems2({
			attachParams: {
				...attachParams,
				products: [product!],
				prices: product?.prices || [],
				entitlements: product?.entitlements || [],
			},
			config,
		});

		itemSet = mergeItemSets({
			curItemSet: itemSet,
			newItemSet,
		});
	}

	return {
		removeCusProducts,
		expireCusProducts,
		itemSet,
	};
};
