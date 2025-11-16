import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sanitizeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";

export const createSubSchedule = async ({
	db,
	attachParams,
	itemSet,
	endOfBillingPeriod,
}: {
	db: DrizzleCli;
	attachParams: AttachParams;
	itemSet: ItemSet;
	endOfBillingPeriod: number;
}) => {
	const { org, customer, paymentMethod } = attachParams;

	const { stripeCli } = attachParams;

	// let subItems = items.filter(
	//   (item: any, index: number) =>
	//     index >= prices.length ||
	//     prices[index].config!.interval !== BillingInterval.OneOff
	// );
	// let oneOffItems = items.filter(
	//   (item: any, index: number) =>
	//     index < prices.length &&
	//     prices[index].config!.interval === BillingInterval.OneOff
	// );
	const { subItems, invoiceItems, usageFeatures } = itemSet;

	const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
		customer: customer.processor.id,
		start_date: endOfBillingPeriod,
		billing_mode: { type: "flexible" },
		phases: [
			{
				items: sanitizeSubItems(subItems),
				default_payment_method: paymentMethod?.id,
				add_invoice_items:
					invoiceItems as Stripe.SubscriptionScheduleCreateParams.Phase.AddInvoiceItem[],
			},
		],
	});

	await SubService.createSub({
		db,
		sub: {
			id: generateId("sub"),
			stripe_id: null,
			stripe_schedule_id: newSubscriptionSchedule.id,
			created_at: Date.now(),
			usage_features: usageFeatures,
			org_id: org.id,
			env: customer.env,
			current_period_start: null,
			current_period_end: null,
		},
	});

	return newSubscriptionSchedule;
};
