import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "./customerProductToLineItems";
import { invoiceCreditFromStoredLineItems } from "./invoiceCreditFromStoredLineItems";
import { licenseInvoiceCreditFromStoredLineItems } from "./licenseInvoiceCreditFromStoredLineItems";

export const getRefundLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	priceFilters,
	billingCycleAnchorMsOverride,
	includeCatalogFallback = true,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	priceFilters?: { excludeOneOffPrices?: boolean };
	billingCycleAnchorMsOverride?: BillingContext["billingCycleAnchorMs"];
	includeCatalogFallback?: boolean;
}): LineItem[] => {
	const {
		lineItems: matchedCredits,
		allPricesResolved,
		resolvedPriceIds,
	} = invoiceCreditFromStoredLineItems({
		ctx,
		customerProduct,
		billingContext,
	});

	const licenseCredits = (customerProduct.customer_licenses ?? []).flatMap(
		(customerLicense) =>
			licenseInvoiceCreditFromStoredLineItems({
				ctx,
				billingContext,
				customerProduct,
				customerLicense,
			}),
	);

	if (allPricesResolved || !includeCatalogFallback) {
		return [...matchedCredits, ...licenseCredits];
	}

	const catalogCredits = customerProductToLineItems({
		ctx,
		customerProduct,
		billingContext,
		direction: "refund",
		priceFilters,
		billingCycleAnchorMsOverride,
	});

	const fallbackCredits = catalogCredits.filter(
		(li) => !resolvedPriceIds.includes(li.context.price.id),
	);

	return [...matchedCredits, ...fallbackCredits];
};
