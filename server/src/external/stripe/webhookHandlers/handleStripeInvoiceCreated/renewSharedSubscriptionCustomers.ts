import type { LineItem } from "@autumn/shared";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { withStripeEventCustomer } from "../../webhookMiddlewares/stripeToAutumnCustomerMiddleware";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { renewCustomerOnInvoice } from "./renewCustomerOnInvoice";
import {
	type InvoiceCreatedContext,
	setupInvoiceCreatedContext,
} from "./setupInvoiceCreatedContext";
import { shouldPreserveInvoiceCreatedCache } from "./shouldPreserveInvoiceCreatedCache";

/**
 * An org can bill another org's plan through its own subscription, so one cycle invoice can renew
 * several customers. The event resolved to one of them; each of the others bills its usage onto the
 * same invoice and resets, under its own ctx. Renewal is retry-safe, so if one fails the event's retry
 * re-runs the customers that already renewed without billing or resetting them twice.
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
	const customersOnSubscription = await CusService.listByStripeSubscriptionId({
		ctx,
		stripeSubscriptionId,
	});
	const otherCustomers = customersOnSubscription.filter(
		(customer) => customer.internal_id !== fullCustomer.internal_id,
	);
	const arrearLineItems: LineItem[] = [];

	for (const customer of otherCustomers) {
		const customerCtx = await withStripeEventCustomer({ ctx, customer });
		const customerEventContext = await setupInvoiceCreatedContext({
			ctx: customerCtx,
			event,
		});
		if (!customerEventContext) continue;

		ctx.logger.info(
			`[invoice.created] Renewing ${customer.id ?? customer.internal_id} on shared subscription ${stripeSubscriptionId}`,
		);
		const customerArrearLineItems = await renewCustomerOnInvoice({
			ctx: customerCtx,
			eventContext: customerEventContext,
		});
		arrearLineItems.push(...customerArrearLineItems);

		if (
			shouldPreserveInvoiceCreatedCache({ eventContext: customerEventContext })
		)
			continue;

		await deleteCachedFullCustomer({
			ctx: customerCtx,
			customerId: customer.id ?? customer.internal_id,
			source: "invoice.created: shared subscription",
			flushBalances: true,
		});
	}

	return arrearLineItems;
};
