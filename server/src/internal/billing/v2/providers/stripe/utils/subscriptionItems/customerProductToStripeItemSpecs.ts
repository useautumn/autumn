import {
	type BillingContext,
	type FullCusProduct,
	isOneOffPrice,
	type StripeItemSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusPriceToStripeItemSpec } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusPriceToStripeItemSpec";

/**
 * Converts a customer product to stripe item specs (recurring + one-off).
 * Delegates each cusPrice to cusPriceToStripeItemSpec.
 */
export const customerProductToStripeItemSpecs = ({
	ctx,
	customerProduct,
	billingContext,
	options,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext?: BillingContext;
	options?: { isDuplicateProductId?: boolean };
}): {
	recurringItems: StripeItemSpec[];
	oneOffItems: StripeItemSpec[];
} => {
	const recurringItems: StripeItemSpec[] = [];
	const oneOffItems: StripeItemSpec[] = [];

	for (const cusPrice of customerProduct.customer_prices) {
		const spec = cusPriceToStripeItemSpec({
			ctx,
			cusPrice,
			cusProduct: customerProduct,
			billingContext,
			options,
		});

		if (!spec) continue;

		if (isOneOffPrice(cusPrice.price)) {
			oneOffItems.push(spec);
		} else {
			recurringItems.push(spec);
		}
	}

	return { recurringItems, oneOffItems };
};
