import {
	type AppEnv,
	EntInterval,
	type Organization,
	type ResetCusEnt,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format, getDate, getMonth, setDate } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const shortDurations: string[] = [
	EntInterval.Minute,
	EntInterval.Hour,
	EntInterval.Day,
];

export const getStripeSubscriptionAnchor = async ({
	db,
	cusEnt,
	nextResetAt,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	nextResetAt: number;
}) => {
	const entInterval = cusEnt.entitlement?.interval;
	if (entInterval && shortDurations.includes(entInterval)) return nextResetAt;

	let nextResetAtDate = new UTCDate(nextResetAt);

	// Only check Stripe anchor on edge dates (28th Feb, 30th of month)
	const nextResetAtDay = getDate(nextResetAtDate);
	const nextResetAtMonth = getMonth(nextResetAtDate);

	const shouldCheck =
		nextResetAtDay === 30 || (nextResetAtDay === 28 && nextResetAtMonth === 1);

	if (!shouldCheck) return nextResetAt;

	// 1. Get the customer product
	const cusProduct = await CusProductService.getByIdForReset({
		db,
		id: cusEnt.customer_product_id ?? "",
	});

	// Get org and env
	const env = cusProduct.product.env as AppEnv;
	const org = cusProduct.product.org as Organization;

	const stripeCli = createStripeCli({ org, env });
	if (
		!cusProduct.subscription_ids ||
		cusProduct.subscription_ids.length === 0
	) {
		return nextResetAt;
	}

	const subId = cusProduct.subscription_ids[0];
	const sub = await stripeCli.subscriptions.retrieve(subId);

	const billingCycleAnchor = sub.billing_cycle_anchor * 1000;
	console.log("Checking billing cycle anchor");
	console.log(
		"Next reset at       ",
		format(new UTCDate(nextResetAt), "dd MMM yyyy HH:mm:ss"),
	);
	console.log(
		"Billing cycle anchor",
		format(new UTCDate(billingCycleAnchor), "dd MMM yyyy HH:mm:ss"),
	);

	const billingCycleDay = getDate(new UTCDate(billingCycleAnchor));
	const nextResetDay = getDate(nextResetAtDate);

	if (billingCycleDay > nextResetDay) {
		nextResetAtDate = setDate(nextResetAtDate, billingCycleDay);
		return nextResetAtDate.getTime();
	} else {
		return nextResetAt;
	}
};
