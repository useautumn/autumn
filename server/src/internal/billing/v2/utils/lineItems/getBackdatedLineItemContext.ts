import type {
	BillingContext,
	BillingPeriod,
	LineItemContext,
	Price,
} from "@autumn/shared";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";
import { getBackdatedImmediatePeriod } from "@/internal/billing/v2/utils/backdate/getBackdatedImmediatePeriod";
import {
	type BackdateGapRun,
	getBackdateGapLineItemContext,
} from "@/internal/billing/v2/utils/backdate/getBackdateGapLineItemContext";

type BackdatedLineItemContext = Pick<
	LineItemContext,
	"now" | "effectivePeriod" | "backdate"
> &
	Partial<Pick<LineItemContext, "billingPeriod">>;

export const getBackdatedLineItemContext = ({
	price,
	billingContext,
	billingPeriod,
	direction,
	billingTiming,
	backdateGapRun,
}: {
	price: Price;
	billingContext: BillingContext;
	billingPeriod?: BillingPeriod;
	direction: LineItemContext["direction"];
	billingTiming: LineItemContext["billingTiming"];
	backdateGapRun?: BackdateGapRun;
}): BackdatedLineItemContext | undefined => {
	if (!billingPeriod) return undefined;
	if (billingContext.subscriptionBackdateStartMs === undefined)
		return undefined;
	if (billingContext.stripeSubscription) return undefined;
	if (direction !== "charge") return undefined;
	if (billingTiming !== "in_advance") return undefined;
	if (isBackdateRecreate({ billingContext })) {
		return (
			backdateGapRun &&
			getBackdateGapLineItemContext({ price, billingContext, backdateGapRun })
		);
	}

	const period = getBackdatedImmediatePeriod({
		price,
		billingContext,
	});
	if (!period) return undefined;

	return {
		now: billingPeriod.start,
		effectivePeriod: { start: period.start, end: period.end },
		backdate: {
			startsAt: period.start,
			cycleCount: period.cycleCount,
		},
	};
};
