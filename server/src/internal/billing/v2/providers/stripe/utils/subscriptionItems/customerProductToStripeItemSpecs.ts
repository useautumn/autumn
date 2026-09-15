import {
	type BillingContext,
	cusPriceToCusEntWithCusProduct,
	type FullCusProduct,
	isConsumablePrice,
	isOneOffPrice,
	type Price,
	type StripeItemSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusPriceToStripeItemSpec } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusPriceToStripeItemSpec";
import { isInvoiceCreditMeterSettledByLines } from "@/internal/features/invoiceCredits/isInvoiceCreditMeterSettledByLines.js";
import { customerLicenseToStripeItemSpecs } from "./customerLicenseToStripeItemSpecs";

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
	const invoiceCreditSpecs = new Map<
		StripeItemSpec,
		FullCusProduct["customer_entitlements"][number]
	>();

	for (const cusPrice of customerProduct.customer_prices) {
		const spec = cusPriceToStripeItemSpec({
			ctx,
			cusPrice,
			cusProduct: customerProduct,
			billingContext,
			options,
		});

		if (!spec) continue;
		if (isConsumablePrice(cusPrice.price)) {
			const customerEntitlement = cusPriceToCusEntWithCusProduct({
				cusProduct: customerProduct,
				cusPrice,
				cusEnts: customerProduct.customer_entitlements,
			});
			if (customerEntitlement)
				invoiceCreditSpecs.set(spec, customerEntitlement);
		}

		if (isOneOffPrice(cusPrice.price)) {
			oneOffItems.push(spec);
		} else {
			recurringItems.push(spec);
		}
	}

	if (billingContext) {
		for (const customerLicense of customerProduct.customer_licenses ?? []) {
			recurringItems.push(
				...customerLicenseToStripeItemSpecs({
					billingContext,
					customerLicense,
				}),
			);
		}
	}

	const candidatePrices = recurringItems
		.map((item) => item.autumnPrice)
		.filter((price): price is Price => Boolean(price));
	return {
		recurringItems: recurringItems.filter((item) => {
			const customerEntitlement = invoiceCreditSpecs.get(item);
			if (!customerEntitlement || !item.autumnPrice) return true;
			return !isInvoiceCreditMeterSettledByLines({
				price: item.autumnPrice,
				customerEntitlement,
				candidatePrices,
			});
		}),
		oneOffItems,
	};
};
