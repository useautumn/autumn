import type { LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { forEachOtherCustomerOnSubscription } from "../common/forEachOtherCustomerOnSubscription";
import { renewCustomerOnInvoice } from "./renewCustomerOnInvoice";
import {
	type InvoiceCreatedContext,
	setupInvoiceCreatedContext,
} from "./setupInvoiceCreatedContext";
import { shouldPreserveInvoiceCreatedCache } from "./shouldPreserveInvoiceCreatedCache";

/**
 * One cycle invoice can renew several customers. Each other customer on the subscription bills its usage
 * onto the same invoice and resets. Renewal is retry-safe: a retry re-runs customers that already renewed
 * without billing or resetting them twice.
 *
 * Returns the usage lines the other customers put on the invoice, so the invoice's stored lines keep
 * their feature and customer-price links. Only usage lines: a shared plan's base price is the same
 * Stripe price for every customer on it, so their in-advance lines would match the resolved customer's.
 */
export const renewSharedSubscriptionCustomers = async ({
	ctx,
	event,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceCreatedEvent;
	eventContext: InvoiceCreatedContext;
}): Promise<LineItem[]> => {
	const { stripeSubscriptionId, fullCustomer } = eventContext;

	const arrearLineItemsPerCustomer = await forEachOtherCustomerOnSubscription({
		ctx,
		stripeSubscriptionId,
		resolvedCustomer: fullCustomer,
		source: "invoice.created: shared subscription",
		step: async ({ customerCtx, customer }) => {
			const customerEventContext = await setupInvoiceCreatedContext({
				ctx: customerCtx,
				event,
			});
			if (!customerEventContext) return null;

			ctx.logger.info(
				`[invoice.created] Renewing ${customer.id ?? customer.internal_id} on shared subscription ${stripeSubscriptionId}`,
			);
			const arrearLineItems = await renewCustomerOnInvoice({
				ctx: customerCtx,
				eventContext: customerEventContext,
			});
			return {
				result: arrearLineItems,
				customerStateChanged: !shouldPreserveInvoiceCreatedCache({
					eventContext: customerEventContext,
				}),
			};
		},
	});

	return arrearLineItemsPerCustomer.flat();
};
