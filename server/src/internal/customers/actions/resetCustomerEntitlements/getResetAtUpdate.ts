import type {
	AppEnv,
	EntInterval,
	FullCusProduct,
	Organization,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { getDate, getMonth, setDate } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getNextResetAt } from "@/utils/timeUtils.js";

/** Computes next reset timestamp, adjusting for Stripe billing anchor on edge dates. */
export const getResetAtUpdate = async ({
	curResetAt,
	interval,
	intervalCount,
	cusProduct,
	org,
	env,
}: {
	curResetAt: number;
	interval: EntInterval;
	intervalCount: number;
	cusProduct: FullCusProduct | null;
	org: Organization;
	env: AppEnv;
}): Promise<number> => {
	const nextResetAt = getNextResetAt({
		curReset: new UTCDate(curResetAt),
		interval,
		intervalCount,
	});

	if (!cusProduct) return nextResetAt;

	// Only check Stripe anchor on edge dates (28th Feb, 30th of month)
	const nextResetAtDate = new UTCDate(nextResetAt);
	const nextResetAtDay = getDate(nextResetAtDate);
	const nextResetAtMonth = getMonth(nextResetAtDate);

	const shouldCheck =
		nextResetAtDay === 30 || (nextResetAtDay === 28 && nextResetAtMonth === 2);

	if (!shouldCheck) return nextResetAt;

	if (
		!cusProduct.subscription_ids ||
		cusProduct.subscription_ids.length === 0
	) {
		return nextResetAt;
	}

	try {
		const stripeCli = createStripeCli({ org, env });
		const subId = cusProduct.subscription_ids[0];
		const sub = await stripeCli.subscriptions.retrieve(subId);

		const billingCycleAnchor = sub.billing_cycle_anchor * 1000;
		const billingCycleDay = getDate(new UTCDate(billingCycleAnchor));

		if (billingCycleDay > nextResetAtDay) {
			return setDate(nextResetAtDate, billingCycleDay).getTime();
		}
	} catch (error) {
		console.log(`[Lazy Reset] WARNING: Failed to check sub anchor: ${error}`);
	}

	return nextResetAt;
};
