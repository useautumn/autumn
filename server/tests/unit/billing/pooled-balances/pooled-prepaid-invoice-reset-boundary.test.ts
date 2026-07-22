import { expect, test } from "bun:test";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import {
	type ProcessPrepaidPricesDependencies,
	processPrepaidPricesForInvoiceCreatedWithDependencies,
} from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated.js";

test("uses the forward subscription period for a pooled invoice reset", async () => {
	const justEndedPeriod = 1_000;
	const nextSubscriptionPeriodEnd = 2_000;
	const resetBoundaries: Array<number | undefined> = [];
	const dependencies = {
		withCustomerBalanceSyncLock: async ({
			callback,
		}: Parameters<
			ProcessPrepaidPricesDependencies["withCustomerBalanceSyncLock"]
		>[0]) => callback({ db: {} as never }),
		updateCustomerProduct: async () => {},
		updateCustomerEntitlement: async () => {},
		decrementCustomerEntitlement: async () => {},
		insertRollovers: async () => {},
		executePooledBalanceOps: async () => {},
		resetPooledBalancesByResetOwner: async ({
			subscriptionNextResetAt,
		}: Parameters<
			ProcessPrepaidPricesDependencies["resetPooledBalancesByResetOwner"]
		>[0]) => {
			resetBoundaries.push(subscriptionNextResetAt);
			return [];
		},
		deleteCachedFullCustomer: async () => {},
	} as unknown as ProcessPrepaidPricesDependencies;
	const eventContext = {
		stripeInvoice: {
			billing_reason: "subscription_cycle",
			period_end: justEndedPeriod,
		},
		stripeSubscription: {
			id: "subscription_one",
			metadata: {},
			items: {
				data: [
					{
						current_period_start: justEndedPeriod,
						current_period_end: nextSubscriptionPeriodEnd,
					},
				],
			},
		},
		stripeSubscriptionId: "subscription_one",
		fullCustomer: {
			id: "customer_one",
			internal_id: "internal_customer_one",
		},
		customerProducts: [],
		nowMs: justEndedPeriod * 1000,
	} as unknown as InvoiceCreatedContext;

	await processPrepaidPricesForInvoiceCreatedWithDependencies({
		ctx: {} as never,
		eventContext,
		dependencies,
	});

	expect(resetBoundaries).toEqual([nextSubscriptionPeriodEnd * 1000]);
});
