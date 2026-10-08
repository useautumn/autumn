import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { billsProratedTime } from "../utils/backdateGap";
import { paidBackdateAnchorMove } from "../utils/paidBackdateAnchorMove";

/**
 * A paid backdate recreate moved off its paid-through date settles the difference like a live anchor move: a later anchor
 * charges the stub from the paid-through date to it, an earlier one credits the paid time after it. None settles nothing.
 */
export const paidBackdateAnchorMoveLineItems = ({
	ctx,
	billingContext,
	keptCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	keptCustomerProducts: FullCusProduct[];
}): LineItem[] => {
	const anchorMove = paidBackdateAnchorMove({ billingContext });
	if (!anchorMove || !billsProratedTime({ billingContext })) return [];

	const { anchorMs, paidThroughMs } = anchorMove;
	const movesLater = anchorMs > paidThroughMs;
	return keptCustomerProducts.flatMap((customerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct,
			billingContext: {
				...billingContext,
				currentEpochMs: movesLater ? paidThroughMs : anchorMs,
			},
			direction: movesLater ? "charge" : "refund",
			priceFilters: { excludeOneOffPrices: true },
			billingCycleAnchorMsOverride: movesLater ? anchorMs : paidThroughMs,
		}),
	);
};
