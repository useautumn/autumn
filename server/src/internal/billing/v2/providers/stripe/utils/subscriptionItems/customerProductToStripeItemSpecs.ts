import type { BillingContext } from "@autumn/shared";
import {
	addCusProductToCusEnt,
	BillingVersion,
	cusPriceToCusEnt,
	cusProductToProduct,
	entToOptions,
	type FeatureOptions,
	type FullCusProduct,
	formatPrice,
	InternalError,
	isAllocatedCustomerEntitlement,
	isOneOffPrice,
	priceUtils,
	type StripeItemSpec,
} from "@autumn/shared";
import { cusEntToInvoiceUsage } from "@shared/utils/cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Convert a customer product to stripe item specs
 * A stripe item spec is an internal intermediate type containing the stripe price id and quantity of the item.
 * @param ctx - The context
 * @param customerProduct - The customer product
 * @param billingContext - The billing context
 * @returns The stripe item specs
 */
export const customerProductToStripeItemSpecs = ({
	ctx,
	customerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext?: BillingContext;
}): {
	recurringItems: StripeItemSpec[];
	oneOffItems: StripeItemSpec[];
} => {
	const { org } = ctx;
	const product = cusProductToProduct({ cusProduct: customerProduct });

	const cusPrices = customerProduct.customer_prices;
	const cusEnts = customerProduct.customer_entitlements;

	const fromVercel = billingContext?.paymentMethod?.type === "custom";

	const recurringItems: StripeItemSpec[] = [];
	const oneOffItems: StripeItemSpec[] = [];

	for (const cusPrice of cusPrices) {
		const price = cusPrice.price;
		const cusEnt = cusPriceToCusEnt({ cusPrice, cusEnts });
		const ent = cusEnt?.entitlement;

		let options: FeatureOptions | undefined;
		let existingUsage: number | undefined;
		const cusEntWithCusProduct = cusEnt
			? addCusProductToCusEnt({
					cusEnt,
					cusProduct: customerProduct,
				})
			: undefined;

		if (cusEnt) {
			const ent = cusEnt.entitlement;
			options = entToOptions({ ent, options: customerProduct.options ?? [] });

			if (
				cusEntWithCusProduct &&
				isAllocatedCustomerEntitlement(cusEntWithCusProduct)
			) {
				existingUsage = cusEntToInvoiceUsage({ cusEnt: cusEntWithCusProduct });
			}
		}

		const stripeItem = priceToStripeItem({
			price,
			product,
			org,
			options,
			isCheckout: false, // TODO: Add this back in?
			relatedEnt: ent,
			existingUsage,
			// withEntity: notNullish(customerProduct.internal_entity_id),
			withEntity: false,
			apiVersion: ctx.apiVersion.value,
			fromVercel,
			isPrepaidPriceV2: billingContext?.billingVersion === BillingVersion.V2,
		});

		if (!stripeItem) continue;

		const { lineItem } = stripeItem;

		if (!lineItem.price && !priceUtils.isTieredOneOff({ price, product })) {
			throw new InternalError({
				message: `Autumn price ${formatPrice({ price })} has no stripe price id`,
			});
		}

		if (isOneOffPrice(price)) {
			oneOffItems.push({
				stripePriceId: lineItem.price ?? "",
				quantity: lineItem?.quantity,
				autumnPrice: price,
				autumnEntitlement: ent,
				autumnProduct: product,
				autumnCusEnt: cusEntWithCusProduct,
			});
		} else {
			recurringItems.push({
				stripePriceId: lineItem.price ?? "",
				quantity: lineItem?.quantity,
				autumnPrice: price,
				autumnEntitlement: ent,
				autumnProduct: product,
				autumnCusEnt: cusEntWithCusProduct,
			});
		}
	}

	return { recurringItems, oneOffItems };
};
