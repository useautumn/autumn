import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { billsProratedTime } from "../utils/backdateGap";
import { paidBackdateAnchorMove } from "../utils/paidBackdateAnchorMove";

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
