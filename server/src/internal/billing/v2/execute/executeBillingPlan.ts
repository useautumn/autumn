import type Stripe from "stripe";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/billingPlan";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeInvoiceAction } from "@/internal/billing/v2/execute/executeStripeInvoiceAction";
import { removeStripeSubscriptionIdFromBillingPlan } from "@/internal/billing/v2/execute/removeStripeSubscriptionIdFromBillingPlan";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { logBillingPlan } from "@/internal/billing/v2/utils/logBillingPlan";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling";
import { addSubIdToCache } from "@/internal/customers/cusCache/subCacheUtils";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	logBillingPlan({ ctx, billingPlan });

	const {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	} = billingPlan.stripe;

	if (stripeInvoiceAction) {
		const result = await executeStripeInvoiceAction({
			ctx,
			billingContext,
			stripeInvoiceAction,
		});

		if (result.invoice) {
			await upsertInvoiceFromBilling({
				ctx,
				stripeInvoice: result.invoice,
				fullProducts: billingContext.fullProducts,
				fullCustomer: billingContext.fullCustomer,
			});
		}
	}

	let stripeSubscription: Stripe.Subscription | undefined =
		billingContext.stripeSubscription;

	if (stripeSubscriptionAction) {
		// 1. Insert stripe subscription ID into cache
		if (stripeSubscription?.id) {
			await addSubIdToCache({
				subId: stripeSubscription.id,
				scenario: "billing",
			});
		}

		stripeSubscription = await executeStripeSubscriptionAction({
			ctx,
			subscriptionAction: stripeSubscriptionAction,
		});

		if (stripeSubscription) {
			addStripeSubscriptionIdToBillingPlan({
				billingPlan,
				stripeSubscriptionId: stripeSubscription.id,
			});

			// Add subscription to DB
			await upsertSubscriptionFromBilling({
				ctx,
				stripeSubscription,
			});
		}

		// If the stripe subscription is canceled, remove the subscription from the billing plan
		if (isStripeSubscriptionCanceled(stripeSubscription)) {
			removeStripeSubscriptionIdFromBillingPlan({
				billingPlan,
				stripeSubscriptionId: stripeSubscription.id,
			});

			stripeSubscription = undefined;
		}
	}

	if (stripeSubscriptionScheduleAction) {
		const stripeSubscriptionSchedule =
			await executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext,
				subscriptionScheduleAction: stripeSubscriptionScheduleAction,
				stripeSubscription,
			});

		if (stripeSubscriptionSchedule) {
			addStripeSubscriptionScheduleIdToBillingPlan({
				billingPlan,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			});
		}
	}

	console.log(
		"Inserting new customer product:",
		billingPlan.autumn.insertCustomerProducts.map((cp) => ({
			name: cp.product.name,
			id: cp.id,
			status: cp.status,
		})),
	);
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	return billingPlan;
};
