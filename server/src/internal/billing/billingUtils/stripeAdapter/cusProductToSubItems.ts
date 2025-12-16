import {
	type AttachContext,
	addCusProductToCusEnt,
	cusPriceToCusEnt,
	cusProductToProduct,
	entToOptions,
	type FeatureOptions,
	type FullCusProduct,
	isAllocatedCusEnt,
	notNullish,
	type StripeItemSpec,
} from "@autumn/shared";
import { cusEntToInvoiceUsage } from "../../../../../../shared/utils/cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { priceToStripeItem } from "../../../../external/stripe/priceToStripeItem/priceToStripeItem";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";

export const cusProductToSubItems = ({
	ctx,
	cusProduct,
	attachContext,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	attachContext?: AttachContext;
}) => {
	const product = cusProductToProduct({ cusProduct });

	const cusPrices = cusProduct.customer_prices;
	const cusEnts = cusProduct.customer_entitlements;
	const fromVercel = attachContext?.paymentMethod?.type === "custom";

	const { org } = ctx;

	const stripeItems: StripeItemSpec[] = [];

	for (const cusPrice of cusPrices) {
		const price = cusPrice.price;
		const cusEnt = cusPriceToCusEnt({ cusPrice, cusEnts });
		const ent = cusEnt?.entitlement;

		let options: FeatureOptions | undefined;
		let existingUsage: number | undefined;
		if (cusEnt) {
			const ent = cusEnt.entitlement;
			options = entToOptions({ ent, options: cusProduct.options ?? [] });

			const cusEntWithCusProduct = addCusProductToCusEnt({
				cusEnt,
				cusProduct,
			});

			if (isAllocatedCusEnt(cusEntWithCusProduct)) {
				existingUsage = cusEntToInvoiceUsage({ cusEnt: cusEntWithCusProduct });
			}
		}

		const stripeItem = priceToStripeItem({
			price,
			product,
			org,
			options,
			isCheckout: false, // TODO: Add this back in
			relatedEnt: ent,
			existingUsage,
			withEntity: notNullish(cusProduct.internal_entity_id),
			apiVersion: ctx.apiVersion.value,
			fromVercel,
		});

		if (!stripeItem) {
			continue;
		}

		const { lineItem } = stripeItem;

		// subItems.push(lineItem);
		stripeItems.push({
			stripePriceId: lineItem?.price ?? "",
			quantity: lineItem?.quantity,
			autumnPrice: price,
		});
	}

	return stripeItems;
};

// const {
//   prices,
//   entitlements,
//   optionsList,
//   cusProducts,
//   customer,
//   internalEntityId,
//   products,
// } = attachParams;

// const subItems: any[] = [];
// const invoiceItems: any[] = [];
// const usageFeatures: any[] = [];
// for (const price of prices) {
//   const priceEnt = getPriceEntitlement(price, entitlements);
//   const options = getEntOptions(optionsList, priceEnt);
//   const prodOptions = priceToProductOptions({
//     price,
//     options: attachParams.productsList,
//     products,
//   });

//   let existingUsage = getExistingUsageFromCusProducts({
//     entitlement: priceEnt,
//     cusProducts,
//     entities: customer.entities ?? [],
//     carryExistingUsages: config.carryUsage,
//     internalEntityId,
//   });

//   const replaceables = priceEnt
//     ? attachParams.replaceables.filter((r) => r.ent.id === priceEnt.id)
//     : [];

//   existingUsage += replaceables.length;

//   const product = getProductForPrice(price, attachParams.products)!;

//   if (!product) {
//     logger.error(
//       `Couldn't find product for price ${price.internal_product_id}`,
//       {
//         data: {
//           products: attachParams.products,
//           price,
//         },
//       },
//     );
//     throw new InternalError({
//       message: `Price internal product ID: ${price.internal_product_id} not found in products`,
//     });
//   }

//   const stripeItem = priceToStripeItem({
//     price,
//     product,
//     org: attachParams.org,
//     options,
//     isCheckout: config.onlyCheckout,
//     relatedEnt: priceEnt,
//     existingUsage,
//     withEntity: notNullish(internalEntityId),
//     apiVersion: attachParams.apiVersion,
//     productOptions: prodOptions,
//     fromVercel: attachParams.paymentMethod?.type === "custom",
//   });

//   if (isUsagePrice({ price })) {
//     usageFeatures.push(priceEnt.feature.internal_id);
//   }

//   if (!stripeItem) {
//     continue;
//   }

//   const { lineItem } = stripeItem;

//   // subItems.push(lineItem);

//   if (price.config.interval === BillingInterval.OneOff) {
//     invoiceItems.push(lineItem);
//   } else {
//     subItems.push({
//       ...lineItem,
//       autumnPrice: price,
//     });
//   }
// }

// return { subItems, invoiceItems, usageFeatures } as ItemSet;
// if (price.config.interval === BillingInterval.OneOff) {
// 	invoiceItems.push({
// 		stripe_price_id: lineItem.price,
// 		quantity: lineItem.quantity,
// 	});
// } else {
// 	subItems.push({
// 		...lineItem,
// 		autumnPrice: price,
// 	});
// }
