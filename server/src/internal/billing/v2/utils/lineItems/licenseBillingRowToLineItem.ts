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
import type { BackdateGapRun } from "@/internal/billing/v2/utils/backdate/getBackdateGapLineItemContext";
import { billingContextToProrationNow } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow.js";
import { getBillingCycleAnchorForDirection } from "@/internal/billing/v2/utils/billingContext/getBillingCycleAnchorForDirection.js";
import { augmentBillingContextForAnchorResetRefund } from "./augmentBillingContextForAnchorResetRefund.js";
import { getBackdatedLineItemContext } from "./getBackdatedLineItemContext.js";
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
	backdateGapRun,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	licenseBillingRow: LicenseBillingPriceRow;
	licenseProduct: FullProductWithoutLicenses;
	customerProduct: FullCusProduct;
	direction: "charge" | "refund";
	backdateGapRun?: BackdateGapRun;
}): LineItem | undefined => {
	const billingContextForPeriod = {
		...billingContext,
		billingCycleAnchorMs: getBillingCycleAnchorForDirection({
			billingContext,
			direction,
		}),
	};
	const billingPeriod = getLineItemBillingPeriod({
		billingContext: billingContextForPeriod,
		price: licenseBillingRow.price,
	});

	let effectiveNow = billingContextToProrationNow({
		billingContext,
		billingPeriod,
		now: billingContext.currentEpochMs,
	});
	if (direction === "refund" && billingPeriod) {
		const action = augmentBillingContextForAnchorResetRefund({
			currentEpochMs: effectiveNow,
			billingPeriod,
			anchorResetRefund: billingContext.anchorResetRefund,
		});
		if (action.type === "skip") return undefined;
		if (action.type === "use_snapped_now") effectiveNow = action.snappedNow;
	}
	// Seats outside a backdate gap keep billing their own current cycle, even on a backdated subscription.
	const backdateGapLineItemContext =
		backdateGapRun &&
		getBackdatedLineItemContext({
			price: licenseBillingRow.price,
			billingContext: billingContextForPeriod,
			billingPeriod,
			direction,
			billingTiming: "in_advance",
			backdateGapRun,
		});
	const context: LineItemContext = {
		price: licenseBillingRow.price,
		product: licenseProduct,
		currency: orgToCurrency({ org: ctx.org }),
		billingPeriod,
		direction,
		billingTiming: "in_advance",
		now: effectiveNow,
		customerProduct,
		...backdateGapLineItemContext,
	};

	return fixedPriceToLineItem({
		context,
		quantity: licenseBillingRow.quantity,
		includeQuantityInDescription: true,
	});
};
