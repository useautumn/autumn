import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import {
	storeRenewalLineItems,
	upsertAutumnInvoice,
} from "@/external/stripe/webhookHandlers/common";
import { consumeBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/common/billingCycleAnchorReset/consumeBillingCycleAnchorReset";
import { planBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/common/billingCycleAnchorReset/planBillingCycleAnchorReset";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import { isBillingCycleAnchorResetInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/isBillingCycleAnchorResetInvoice";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceCreatedContext } from "./setupInvoiceCreatedContext";
import { processConsumablePricesForInvoiceCreated } from "./tasks/processConsumablePricesForInvoiceCreated";

/**
 * A cycle invoice ends one period and starts the next. Each task plans its part of the customer's new
 * period from the snapshot; the plan then lands as one step, so a track in flight sees either the old
 * period or the new one, never a half of each.
 */
export const handleStripeInvoiceCreated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceCreatedEvent;
}) => {
	const eventContext = await setupInvoiceCreatedContext({ ctx, event });

	if (!eventContext) {
		ctx.logger.debug("[invoice.created] Skipping - context not found");
		return;
	}

	ctx.logger.info(
		`[invoice.created] Processing for invoice ${eventContext.stripeInvoice.id}`,
	);

	const { fullCustomer } = eventContext;
	const plan = createAutumnBillingPlanBuilder({
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});

	// 1. Plan the new period. Usage lines go on the invoice first: a line that fails to land means no reset.
	const arrearLineItems = await processConsumablePricesForInvoiceCreated({
		ctx,
		eventContext,
		plan,
	});
	processPrepaidPricesForInvoiceCreated({ ctx, eventContext, plan });
	processAllocatedPricesForInvoiceCreated({ ctx, eventContext, plan });
	if (isBillingCycleAnchorResetInvoice({ eventContext })) {
		planBillingCycleAnchorReset({ ctx, eventContext, plan });
	} else {
		consumeBillingCycleAnchorReset({ eventContext, plan });
	}

	// 2. Land it as one step
	if (plan.hasChanges()) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: plan.build(),
		});
		eventContext.results.customerStateChanged = true;
	}

	// 3. Mirror the invoice
	const shouldStoreScheduleProrationInvoice =
		eventContext.stripeInvoice.billing_reason === "subscription_update" &&
		!!eventContext.stripeSubscription.schedule;
	const updatedStripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: eventContext.stripeInvoice.id,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	const invoiceResult = await upsertAutumnInvoice({
		ctx,
		stripeInvoice: updatedStripeInvoice,
		stripeSubscription: eventContext.stripeSubscription,
		customerProducts: eventContext.customerProducts,
		options: { skipNonCycleInvoices: !shouldStoreScheduleProrationInvoice },
	});
	eventContext.results.invoice = invoiceResult;

	// Store invoice line items (async via SQS workflow)
	const autumnInvoice = invoiceResult?.invoice;
	if (autumnInvoice) {
		const periodEndMs = secondsToMs(eventContext.stripeInvoice.period_end);
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems,
			eventContext,
			periodEndMs,
		});
	}

	ctx.handlerResult = { type: "invoice.created", context: eventContext };
};
