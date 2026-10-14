import type { BillingContext } from "@autumn/shared";
import {
	type BillingPeriod,
	getCycleEnd,
	getCycleStart,
	isOneOffPrice,
	type Price,
} from "@autumn/shared";
import { billingContextToFutureTrialEnd } from "@/internal/billing/v2/utils/billingContext/billingContextToFutureTrialEnd";

export const getLineItemBillingPeriod = ({
	billingContext,
	price,
}: {
	billingContext: BillingContext;
	price: Price;
}): BillingPeriod | undefined => {
	if (isOneOffPrice(price)) return undefined;

	const { billingCycleAnchorMs, currentEpochMs } = billingContext;

	const { interval, interval_count: intervalCount } = price.config;

	const endFloor = billingContextToFutureTrialEnd({ billingContext });

	const start = getCycleStart({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
	});

	const end = getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval,
		intervalCount,
		now: currentEpochMs,
		floor: endFloor,
	});

	return { start, end };
};
