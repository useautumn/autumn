import type { LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import {
	type BaseWebhookEventContext,
	buildBillingContextForInAdvanceInvoice,
} from "./buildBillingContextFromWebhook";

export const cusProductsToRenewalLineItems = ({
	ctx,
	eventContext,
	arrearLineItems,
	periodEndMs,
}: {
	ctx: StripeWebhookContext;
	eventContext: BaseWebhookEventContext;
	arrearLineItems: LineItem[];
	periodEndMs: number;
}): LineItem[] => {
	const { customerProducts } = eventContext;
	const lineItems: LineItem[] = [];

	const billingContext = buildBillingContextForInAdvanceInvoice({
		eventContext,
		periodEndMs,
	});

	for (const cusProduct of customerProducts) {
		const productLineItems = customerProductToLineItems({
			ctx,
			customerProduct: cusProduct,
			billingContext,
			direction: "charge",
		});
		lineItems.push(...productLineItems);
	}

	lineItems.push(...arrearLineItems);

	return lineItems;
};
