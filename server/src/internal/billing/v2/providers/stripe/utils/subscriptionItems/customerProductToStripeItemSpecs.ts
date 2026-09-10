import {
	type BillingContext,
	cusPriceToCusEntWithCusProduct,
	type FullCusProduct,
	isConsumablePrice,
	isFixedPrice,
	isOneOffPrice,
	type StripeItemSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusPriceToStripeItemSpec } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/cusPriceToStripeItemSpec";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";
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
	const invoiceCreditItems = new Set<StripeItemSpec>();

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
			if (
				isInvoiceCreditFeature({
					feature: customerEntitlement?.entitlement.feature,
				})
			) {
				invoiceCreditItems.add(spec);
			}
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

	return {
		recurringItems: recurringItems.filter((item) => {
			if (!invoiceCreditItems.has(item)) return true;
			const creditConfig = item.autumnPrice!.config;
			// Source debits settle credits; retain the meter only when it supplies the renewal cadence.
			return !recurringItems.some((candidate) => {
				const price = candidate.autumnPrice;
				return (
					price &&
					isFixedPrice(price) &&
					price.config.interval === creditConfig.interval &&
					(price.config.interval_count ?? 1) ===
						(creditConfig.interval_count ?? 1)
				);
			});
		}),
		oneOffItems,
	};
};
