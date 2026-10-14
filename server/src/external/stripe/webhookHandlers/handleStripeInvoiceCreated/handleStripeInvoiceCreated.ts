import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import {
	storeRenewalLineItems,
	upsertAutumnInvoice,
} from "@/external/stripe/webhookHandlers/common";
import { consumeBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/consumeBillingCycleAnchorReset";
import { planScheduledPooledAnchorReset } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/planScheduledPooledAnchorReset";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceCreatedContext } from "./setupInvoiceCreatedContext";
import { processConsumablePricesForInvoiceCreated } from "./tasks/processConsumablePricesForInvoiceCreated";

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

	const arrearLineItems = await processConsumablePricesForInvoiceCreated({
		ctx,
		eventContext,
		plan,
	});
	processPrepaidPricesForInvoiceCreated({ ctx, eventContext, plan });
	processAllocatedPricesForInvoiceCreated({ ctx, eventContext, plan });
	planScheduledPooledAnchorReset({ ctx, eventContext, plan });
	consumeBillingCycleAnchorReset({ eventContext, plan });

	if (plan.hasChanges()) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: plan.build(),
		});
		eventContext.results.customerStateChanged = true;
	}

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
