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
import { getBillingCycleAnchorForDirection } from "@/internal/billing/v2/utils/billingContext/getBillingCycleAnchorForDirection.js";
import { augmentBillingContextForAnchorResetRefund } from "./augmentBillingContextForAnchorResetRefund.js";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod.js";

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
}): LineItem | undefined => {
	const billingPeriod = getLineItemBillingPeriod({
		billingContext: {
			...billingContext,
			billingCycleAnchorMs: getBillingCycleAnchorForDirection({
				billingContext,
				direction,
			}),
		},
		price: licenseBillingRow.price,
	});

	let effectiveNow = billingContext.currentEpochMs;
	if (direction === "refund" && billingPeriod) {
		const action = augmentBillingContextForAnchorResetRefund({
			currentEpochMs: effectiveNow,
			billingPeriod,
			anchorResetRefund: billingContext.anchorResetRefund,
		});
		if (action.type === "skip") return undefined;
		if (action.type === "use_snapped_now") effectiveNow = action.snappedNow;
	}
	const context: LineItemContext = {
		price: licenseBillingRow.price,
		product: licenseProduct,
		currency: orgToCurrency({ org: ctx.org }),
		billingPeriod,
		direction,
		billingTiming: "in_advance",
		now: effectiveNow,
		customerProduct,
	};

	return fixedPriceToLineItem({
		context,
		quantity: licenseBillingRow.quantity,
		includeQuantityInDescription: true,
	});
};
