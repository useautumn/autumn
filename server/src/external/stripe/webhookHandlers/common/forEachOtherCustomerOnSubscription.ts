import type { Customer } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { withStripeEventCustomer } from "../../webhookMiddlewares/stripeToAutumnCustomerMiddleware";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";

/** What a step did for one customer: its result, and whether that customer's cached state changed. */
export type SharedSubscriptionStepOutcome<T> = {
	result: T;
	customerStateChanged: boolean;
};

/**
 * An org can bill another org's plan through its own subscription, so several customers can have plans on
 * one Stripe subscription. A webhook resolves to one of them; this runs a step for each of the others,
 * under that customer's own ctx (balance-worker writes landed, loaded, routed to its Redis), and refreshes
 * its cache when the step changed it.
 *
 * Steps run here must be customer-scoped: they change the customer's own plans and balances, never the
 * Stripe subscription or the event's single Autumn records (invoice row, org webhooks), which stay with the
 * resolved customer. A step returns null to skip a customer. Steps run in sequence; if one throws, the event
 * fails and its retry re-runs every customer, so steps must be retry-safe.
 */
export const forEachOtherCustomerOnSubscription = async <T>({
	ctx,
	stripeSubscriptionId,
	resolvedCustomer,
	source,
	step,
}: {
	ctx: StripeWebhookContext;
	stripeSubscriptionId: string;
	resolvedCustomer: Pick<Customer, "internal_id">;
	/** Labels the cache refresh, e.g. "invoice.created: shared subscription". */
	source: string;
	step: (params: {
		customerCtx: StripeWebhookContext;
		customer: Customer;
	}) => Promise<SharedSubscriptionStepOutcome<T> | null>;
}): Promise<T[]> => {
	const customersOnSubscription = await CusService.listByStripeSubscriptionId({
		ctx,
		stripeSubscriptionId,
	});
	const otherCustomers = customersOnSubscription.filter(
		(customer) => customer.internal_id !== resolvedCustomer.internal_id,
	);

	const results: T[] = [];
	for (const customer of otherCustomers) {
		const customerCtx = await withStripeEventCustomer({ ctx, customer });
		const outcome = await step({ customerCtx, customer });
		if (!outcome) continue;

		results.push(outcome.result);
		if (!outcome.customerStateChanged) continue;

		await deleteCachedFullCustomer({
			ctx: customerCtx,
			customerId: customer.id ?? customer.internal_id,
			source,
			flushBalances: true,
		});
	}

	return results;
};
