import type { Invoice, LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { workflows } from "@/queue/workflows";
import {
	type BaseWebhookEventContext,
	buildBillingContextForInAdvanceInvoice,
} from "./buildBillingContextFromWebhook";

export async function storeRenewalLineItems({
	ctx,
	autumnInvoice,
	stripeInvoiceId,
	arrearLineItems,
	eventContext,
	periodEndMs,
	reconcileOnly,
	emitFinalizedWebhook,
}: {
	ctx: StripeWebhookContext;
	autumnInvoice: Invoice;
	stripeInvoiceId: string;
	arrearLineItems: LineItem[];
	eventContext?: BaseWebhookEventContext;
	periodEndMs?: number;
	reconcileOnly?: boolean;
	emitFinalizedWebhook?: boolean;
}): Promise<void> {
	const { org, env, logger } = ctx;

	const billingLineItems: LineItem[] = [];

	if (eventContext && periodEndMs) {
		const billingContext = buildBillingContextForInAdvanceInvoice({
			eventContext,
			periodEndMs,
		});

		for (const cusProduct of eventContext.customerProducts) {
			const productLineItems = customerProductToLineItems({
				ctx,
				customerProduct: cusProduct,
				billingContext,
				direction: "charge",
			});
			billingLineItems.push(...productLineItems);
		}
	}

	billingLineItems.push(...arrearLineItems);

	await workflows.triggerStoreInvoiceLineItems({
		orgId: org.id,
		env,
		stripeInvoiceId,
		autumnInvoiceId: autumnInvoice.id,
		billingLineItems,
		reconcileOnly,
		emitFinalizedWebhook,
	});

	logger.info(
		`[storeRenewalLineItems] Triggered workflow for ${stripeInvoiceId}`,
	);
}
