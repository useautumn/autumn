import {
	type AttachConfig,
	CusProductStatus,
	cusProductToPrices,
	cusProductToProduct,
	type FullCusProduct,
	isConsumablePrice,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import {
	findStripeItemForPrice,
	subItemInCusProduct,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { mergeNewSubItems } from "./mergeNewSubItems.js";
import { getQuantityToRemove } from "./mergeUtils.js";

export const getCusProductsToRemove = ({
	attachParams,
	includeCanceled = false,
	includeScheduled = false,
}: {
	attachParams: AttachParams;
	includeCanceled?: boolean;
	includeScheduled?: boolean;
}) => {
	const products = attachParams.products;
	const cusProducts = attachParams.cusProducts;

	const cusProductsToRemove: FullCusProduct[] = [];
	const prods =
		products.length > 0
			? products
			: [cusProductToProduct({ cusProduct: attachParams.cusProduct! })];

	console.log(
		"Getting customer products to remove, internal entity ID:",
		attachParams.internalEntityId,
	);

	for (const product of prods) {
		// Get cur main and cur same
		const { curMainProduct, curSameProduct, curScheduledProduct } =
			getExistingCusProducts({
				product,
				cusProducts: attachParams.cusProducts,
				internalEntityId: attachParams.internalEntityId,
			});

		// 1. If curScheduledProduct and curMainProduct, want to remove scheduled, main should already be removed...
		if (
			includeScheduled &&
			!product.is_add_on &&
			curScheduledProduct &&
			curMainProduct
		) {
			cusProductsToRemove.push(curScheduledProduct);
		}

		// 2. If cancelling, and same product exists (add on / main), add it.
		else if (curSameProduct && attachParams.fromCancel) {
			cusProductsToRemove.push(curSameProduct);
		}

		// 3. If product is a main product, add curMain
		else if (!product.is_add_on && curMainProduct) {
			cusProductsToRemove.push(curMainProduct);
		}
	}

	if (includeCanceled) {
		const subId = cusProductsToRemove.find(
			(cp) => cp.subscription_ids && cp.subscription_ids.length > 0,
		)?.subscription_ids?.[0];

		const canceledCusProducts = cusProducts.filter(
			(cp) =>
				cp.canceled && (subId ? cp.subscription_ids?.includes(subId!) : true),
		);
		cusProductsToRemove.push(...canceledCusProducts);
	}

	// Get unique cus products, by cusProduct.id
	const uniqueCusProductsToRemove = cusProductsToRemove.filter(
		(cusProduct, index, array) =>
			array.findIndex((cp) => cp.id === cusProduct.id) === index,
	);

	return uniqueCusProductsToRemove;
};

export const paramsToSubItems = async ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be used in the future
	ctx,
	sub,
	attachParams,
	config,
	removeCusProducts,
	addItemSet,
}: {
	ctx: AutumnContext;
	sub?: Stripe.Subscription;
	attachParams: AttachParams;
	config: AttachConfig;
	removeCusProducts?: FullCusProduct[];
	addItemSet?: ItemSet;
}) => {
	const curSubItems = sub?.items.data || [];

	const itemSet = notNullish(addItemSet)
		? addItemSet!
		: await getStripeSubItems2({
				attachParams,
				config,
			});

	// 1. Remove items related to cur cus product...
	const cusProductsToRemove = notNullish(removeCusProducts)
		? removeCusProducts!
		: getCusProductsToRemove({ attachParams });

	ctx.logger.info(
		`[paramsToSubItems] Removing cus products: ${cusProductsToRemove.map((cp) => `${cp.product.id} (E: ${cp.entity_id})`).join(", ")}`,
	);

	const newSubItems = mergeNewSubItems({
		itemSet,
		curSubItems,
	});

	const allCusProducts = attachParams.customer.customer_products;

	// 3. Remove items related to cus products to remove
	const printRemoveLogs = false;
	for (const cusProduct of cusProductsToRemove) {
		const prices = cusProductToPrices({ cusProduct });

		if (printRemoveLogs) {
			console.log("Removing cus product:", cusProduct.product.name);
		}

		for (const price of prices) {
			const existingSubItem = findStripeItemForPrice({
				price,
				stripeItems: curSubItems,
				stripeProdId: cusProduct.product.processor?.id,
			}) as Stripe.SubscriptionItem | undefined;

			if (printRemoveLogs) {
				console.log("Price:", formatPrice({ price }));
				console.log(
					"Existing sub item:",
					existingSubItem
						? {
								id: existingSubItem?.id,
								price: existingSubItem?.price?.id,
								quantity: existingSubItem?.quantity,
							}
						: "N/A",
				);
			}

			if (!existingSubItem) continue;

			// 1. If arrear price
			if (isConsumablePrice(price)) {
				if (
					allCusProducts.some((cp) => {
						if (cp.id === cusProduct.id) return false;

						if (cp.status === CusProductStatus.Scheduled) return false;

						return subItemInCusProduct({
							cusProduct: cp,
							subItem: existingSubItem as Stripe.SubscriptionItem,
						});
					})
				) {
					continue;
				}

				if (
					itemSet.subItems.some((si) => si.price === existingSubItem.price?.id)
				) {
					continue;
				}

				if (printRemoveLogs) {
					console.log(`Deleting consumable sub item ${existingSubItem.id}`);
				}

				newSubItems.push({
					id: existingSubItem.id,
					deleted: true,
				});

				continue;
			}

			// Helper function to handle quantity updates and deletion
			const updateItemQuantity = (item: any, newQuantity: number) => {
				if (newQuantity <= 0) {
					item.deleted = true;
					item.quantity = undefined;
				} else {
					item.quantity = newQuantity;
				}
			};

			// 1. Get quantity to remove
			const quantityToRemove = getQuantityToRemove({
				cusProduct,
				price,
				entities: attachParams.customer.entities,
			});

			// 2. Check if item already exists in newSubItems
			const existingItemIndex = newSubItems.findIndex(
				(si) => si.id === existingSubItem.id,
			);

			if (existingItemIndex !== -1) {
				const currentQuantity = newSubItems[existingItemIndex].quantity || 0;
				const newQuantity = currentQuantity - quantityToRemove;

				updateItemQuantity(newSubItems[existingItemIndex], newQuantity);
			} else {
				const currentQuantity = existingSubItem.quantity || 0;
				const newQuantity = currentQuantity - quantityToRemove;

				newSubItems.push({
					id: existingSubItem.id,
					quantity: newQuantity,
				});

				updateItemQuantity(newSubItems[newSubItems.length - 1], newQuantity);
			}
		}
	}

	return {
		subItems: newSubItems,
		invoiceItems: itemSet.invoiceItems,
		usageFeatures: itemSet.usageFeatures,
	};
};
