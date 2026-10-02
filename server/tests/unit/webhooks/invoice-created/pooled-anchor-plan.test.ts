import { expect, mock, test } from "bun:test";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

const pool = customerEntitlements.create({
	id: "pool_grant",
	featureId: "messages",
	featureName: "Messages",
	allowance: 100,
	balance: 60,
	nextResetAt: 2000000,
});
pool.reset_cycle_anchor = 2000000;
const computePlan = mock(() => ({
	...emptyPooledBalancePlan(),
	updatePoolBalances: [
		{ pooledCustomerEntitlement: pool, balanceDelta: 0, grantedDelta: 0 },
	],
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/pooledBalances/compute/computeScheduledPooledAnchorResetPlan.js",
	() => ({ computeScheduledPooledAnchorResetPlan: computePlan }),
);
const { planScheduledPooledAnchorReset } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/planScheduledPooledAnchorReset.js?pooled-anchor-plan"
);

test("the scheduled anchor plan moves the reset boundary without refilling the pool", () => {
	const product = customerProducts.create({ id: "completed_product" });
	const other = customerProducts.create({ id: "pending_product" });
	const eventContext = {
		stripeInvoice: { billing_reason: "subscription_update" },
		stripeSubscription: { billing_cycle_anchor: 2000 },
		stripeSubscriptionId: "sub_123",
		billingCycleAnchorResetCustomerProductIds: [product.id],
		customerProducts: [product, other],
		fullCustomer: {},
	} as unknown as InvoiceCreatedContext;
	const plan = createAutumnBillingPlanBuilder({ customerId: "customer_123" });
	planScheduledPooledAnchorReset({
		ctx: contexts.create({}) as StripeWebhookContext,
		eventContext,
		plan,
	});
	expect(computePlan).toHaveBeenCalledWith(
		expect.objectContaining({
			customerProducts: [product],
			anchorMs: 2000000,
		}),
	);
	expect(plan.build().updateCustomerEntitlements).toEqual([
		{
			customerEntitlement: pool,
			updates: { reset_cycle_anchor: 2000000, next_reset_at: 2000000 },
		},
	]);
	expect(plan.build().pooledBalancePlan?.updatePoolBalances).toEqual([
		{ pooledCustomerEntitlement: pool, balanceDelta: 0, grantedDelta: 0 },
	]);
});

test("a normal cycle invoice adds no pool reset to the plan", () => {
	const plan = createAutumnBillingPlanBuilder({ customerId: "customer_123" });
	planScheduledPooledAnchorReset({
		ctx: contexts.create({}) as StripeWebhookContext,
		eventContext: {
			stripeInvoice: { billing_reason: "subscription_cycle" },
			billingCycleAnchorResetCustomerProductIds: [],
		} as unknown as InvoiceCreatedContext,
		plan,
	});
	expect(plan.hasChanges()).toBe(false);
});
