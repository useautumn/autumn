import type { BillingCycleResult, RangeEnum } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { sub } from "date-fns";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	getBillingCycleStartDate,
	getStandardIntervalWindow,
} from "../analyticsUtils.js";

const BILLING_CYCLE_RANGES = new Set<RangeEnum>(["1bc", "3bc", "last_cycle"]);

/** Lookback for a billing-cycle range whose customer has no resolvable cycle. */
const FALLBACK_LOOKBACK_DAYS = 24;

const fallbackWindow = () => {
	const now = new UTCDate();
	return {
		start: sub(now, { days: FALLBACK_LOOKBACK_DAYS }).getTime(),
		end: now.getTime(),
	};
};

/** Resolves a range preset to an epoch-ms window. Billing-cycle ranges anchor on
 * the customer's cycle and fall back to a fixed lookback when it has none. */
export const resolveRangeToCustomRange = async ({
	ctx,
	range,
	customerId,
	featureIds,
}: {
	ctx: AutumnContext;
	range: RangeEnum;
	customerId?: string;
	featureIds?: string[];
}): Promise<{ start: number; end: number }> => {
	if (!BILLING_CYCLE_RANGES.has(range)) {
		const window = getStandardIntervalWindow({ interval: range });
		if (!window) return fallbackWindow();
		return { start: window.start.getTime(), end: window.end.getTime() };
	}

	if (!customerId) return fallbackWindow();

	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	if (!customer) return fallbackWindow();

	const billingCycle = (await getBillingCycleStartDate({
		customer,
		db: ctx.db,
		intervalType: range as "1bc" | "3bc" | "last_cycle",
		featureIds,
		ctx,
	})) as BillingCycleResult | null;
	if (!billingCycle?.startDate) return fallbackWindow();

	return {
		start: new UTCDate(billingCycle.startDate).getTime(),
		end: new UTCDate(billingCycle.endDate).getTime(),
	};
};
