import type { LineItem } from "@autumn/shared";
import { consumeBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/consumeBillingCycleAnchorReset";
import { planScheduledPooledAnchorReset } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/planScheduledPooledAnchorReset";
import { processAllocatedPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated";
import { processPrepaidPricesForInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import type { InvoiceCreatedContext } from "./setupInvoiceCreatedContext";
import { processConsumablePricesForInvoiceCreated } from "./tasks/processConsumablePricesForInvoiceCreated";

/**
 * A cycle invoice ends one period and starts the next. Each task plans its part of the customer's new
 * period from the snapshot; the plan then lands as one step, so a track in flight sees either the old
 * period or the new one, never a half of each.
 */
export const renewCustomerOnInvoice = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<LineItem[]> => {
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
	planScheduledPooledAnchorReset({ ctx, eventContext, plan });
	consumeBillingCycleAnchorReset({ eventContext, plan });

	// 2. Land it as one step
	if (plan.hasChanges()) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: plan.build(),
		});
		eventContext.results.customerStateChanged = true;
	}

	return arrearLineItems;
};
