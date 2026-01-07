import {
	addCusProductToCusEnt,
	cusPriceToCusEnt,
	cusProductToProduct,
	entToOptions,
	type FeatureOptions,
	type FullCusProduct,
	isAllocatedCusEnt,
	isOneOffPrice,
	notNullish,
	type StripeItemSpec,
} from "@autumn/shared";
import { cusEntToInvoiceUsage } from "@shared/utils/cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

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
		if (cusEnt) {
			const ent = cusEnt.entitlement;
			options = entToOptions({ ent, options: customerProduct.options ?? [] });

			const cusEntWithCusProduct = addCusProductToCusEnt({
				cusEnt,
				cusProduct: customerProduct,
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
			isCheckout: false, // TODO: Add this back in?
			relatedEnt: ent,
			existingUsage,
			withEntity: notNullish(customerProduct.internal_entity_id),
			apiVersion: ctx.apiVersion.value,
			fromVercel,
		});

		if (!stripeItem) continue;

		const { lineItem } = stripeItem;

		if (isOneOffPrice(price)) {
			oneOffItems.push({
				stripePriceId: lineItem?.price ?? "",
				quantity: lineItem?.quantity,
				autumnPrice: price,
			});
		} else {
			recurringItems.push({
				stripePriceId: lineItem?.price ?? "",
				quantity: lineItem?.quantity,
				autumnPrice: price,
			});
		}
	}

	return { recurringItems, oneOffItems };
};
