import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseToLineItems } from "./customerLicenseToLineItems";
import { customerProductToLineItems } from "./customerProductToLineItems";
import { invoiceCreditFromStoredLineItems } from "./invoiceCreditFromStoredLineItems";

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

	// License charges have no stored-row attribution yet, so their refunds
	// always synthesize from catalog state — even when parent prices resolve.
	const licenseCredits = (customerProduct.customer_licenses ?? []).flatMap(
		(customerLicense) =>
			customerLicenseToLineItems({
				ctx,
				billingContext,
				customerProduct,
				customerLicense,
				direction: "refund",
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
