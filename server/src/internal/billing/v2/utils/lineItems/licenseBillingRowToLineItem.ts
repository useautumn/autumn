import {
	type BillingContext,
	type FullCusProduct,
	type FullProductWithoutLicenses,
	fixedPriceToLineItem,
	type LicenseBillingPriceRow,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

/** refund = prorated credit for the PRE licenseBillingRow, charge = prorated for POST.
 * buildLineItem flips the sign on refunds. */
export const licenseBillingRowToLineItem = ({
	ctx,
	billingContext,
	licenseBillingRow,
	licenseProduct,
	customerProduct,
	direction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	licenseBillingRow: LicenseBillingPriceRow;
	licenseProduct: FullProductWithoutLicenses;
	customerProduct: FullCusProduct;
	direction: "charge" | "refund";
}): LineItem => {
	const billingPeriod = getLineItemBillingPeriod({
		billingContext,
		price: licenseBillingRow.price,
	});

	const context: LineItemContext = {
		price: licenseBillingRow.price,
		product: licenseProduct,
		currency: orgToCurrency({ org: ctx.org }),
		billingPeriod,
		direction,
		billingTiming: "in_advance",
		now: billingContext.currentEpochMs,
		customerProduct,
	};

	return fixedPriceToLineItem({
		context,
		quantity: licenseBillingRow.quantity,
	});
};
