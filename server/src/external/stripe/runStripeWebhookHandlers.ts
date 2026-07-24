import { handleStripeInvoicePaid } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/handleStripeInvoicePaid.js";
import { handleStripeSubscriptionUpdated } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/handleStripeSubscriptionUpdated.js";
import { throwOnSimulatedWebhookFailure } from "./common/simulateTestWebhookFailure.js";
import { handleCusDiscountDeleted } from "./webhookHandlers/handleCusDiscountDeleted.js";
import { handleInvoiceUpdated } from "./webhookHandlers/handleInvoiceUpdated.js";
import { handleStripeCheckoutSessionCompleted } from "./webhookHandlers/handleStripeCheckoutSessionCompleted/handleStripeCheckoutSessionCompleted.js";
import { handleStripeCheckoutSessionExpired } from "./webhookHandlers/handleStripeCheckoutSessionExpired/handleStripeCheckoutSessionExpired.js";
import { handleStripeCustomerUpdated } from "./webhookHandlers/handleStripeCustomerUpdated.js";
import { handleStripeInvoiceCreated } from "./webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated.js";
import { handleStripeInvoiceFinalized } from "./webhookHandlers/handleStripeInvoiceFinalized/handleStripeInvoiceFinalized.js";
import { handleStripeSubscriptionCreated } from "./webhookHandlers/handleStripeSubscriptionCreated/handleStripeSubscriptionCreated.js";
import { handleStripeSubscriptionDeleted } from "./webhookHandlers/handleStripeSubscriptionDeleted/handleStripeSubscriptionDeleted.js";
import { handleStripeSubscriptionScheduleUpdated } from "./webhookHandlers/handleStripeSubscriptionScheduleUpdated/handleStripeSubscriptionScheduleUpdated.js";
import { handleStripeTestClockReady } from "./webhookHandlers/handleStripeTestClockReady.js";
import { handleSubscriptionScheduleCanceled } from "./webhookHandlers/handleSubScheduleCanceled.js";
import type { StripeWebhookContext } from "./webhookMiddlewares/stripeWebhookContext.js";

/**
 * Dispatches a Stripe event to its handler. Shared by the webhook route and
 * the SQS replay worker — errors propagate to the caller.
 */
export const runStripeWebhookHandlers = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { db, org, env, stripeEvent } = ctx;
	const event = stripeEvent;

	await throwOnSimulatedWebhookFailure({ ctx });

	switch (event.type) {
		case "customer.updated":
			await handleStripeCustomerUpdated({ ctx, event });
			break;

		case "customer.subscription.created":
			await handleStripeSubscriptionCreated({ ctx });
			break;

		case "customer.subscription.updated":
			await handleStripeSubscriptionUpdated({ ctx, event });
			break;

		case "customer.subscription.deleted":
			await handleStripeSubscriptionDeleted({ ctx, event });
			break;

		case "invoice.paid":
			await handleStripeInvoicePaid({ ctx, event });
			break;

		case "invoice.updated":
			await handleInvoiceUpdated({
				ctx,
				event,
			});
			break;

		case "invoice.created":
			await handleStripeInvoiceCreated({ ctx, event });
			break;

		case "invoice.finalized": {
			await handleStripeInvoiceFinalized({ ctx, event });
			break;
		}

		case "subscription_schedule.updated": {
			await handleStripeSubscriptionScheduleUpdated({ ctx, event });
			break;
		}

		case "subscription_schedule.canceled": {
			const canceledSchedule = event.data.object;
			await handleSubscriptionScheduleCanceled({
				db,
				org,
				env,
				schedule: canceledSchedule,
			});
			break;
		}

		case "customer.discount.deleted":
			await handleCusDiscountDeleted({ ctx });
			break;

		case "checkout.session.completed": {
			await handleStripeCheckoutSessionCompleted({ ctx, event });
			break;
		}

		case "checkout.session.expired": {
			await handleStripeCheckoutSessionExpired({ ctx, event });
			break;
		}

		case "test_helpers.test_clock.ready": {
			await handleStripeTestClockReady({ ctx, event });
			break;
		}

		default:
			break;
	}
};
