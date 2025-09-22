import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import {
	AttachConfig,
	FullCusProduct,
	getCusProductMinQuantity,
	ProductOptions,
} from "@autumn/shared";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { mergeItemSets } from "./mergeItemSets.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

export const getProdListWithoutEntities = ({
	attachParams,
	productsList,
}: {
	attachParams: AttachParams;
	productsList: ProductOptions[];
}) => {
	const newProdList = structuredClone(productsList);
	for (let i = 0; i < newProdList.length; i++) {
		let productOptions = newProdList[i];
		newProdList[i] = {
			...productOptions,
			quantity:
				(productOptions.quantity || 1) -
				getCusProductMinQuantity({
					cusProducts: attachParams.customer.customer_products,
					productId: productOptions.product_id,
				}),
		};
	}
	return newProdList;
};

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

	const newProdList = getProdListWithoutEntities({
		attachParams,
		productsList,
	});

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
				productsList: newProdList,
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
