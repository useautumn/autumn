import type { AppEnv, Organization, ResetCusEnt } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format, getDate, getMonth, setDate } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const getStripeSubscriptionAnchor = async ({
	db,
	cusEnt,
	nextResetAt,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	nextResetAt: number;
}) => {
	let nextResetAtDate = new UTCDate(nextResetAt);

	// If nextResetAt is on the 28th of March, or Day 30, then do this check.
	const nextResetAtDay = getDate(nextResetAtDate);
	const nextResetAtMonth = getMonth(nextResetAtDate);

	const shouldCheck =
		nextResetAtDay === 30 || (nextResetAtDay === 28 && nextResetAtMonth === 2);

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
