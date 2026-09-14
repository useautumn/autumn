import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { addMonths } from "date-fns";

// An anchor-only update must move Stripe's billing anchor along with Autumn's reset date.
test("update-sub standalone anchor reset moves the Stripe billing cycle", async () => {
	const customerId = "update-anchor-reset-standalone";
	const plan = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.attach({ productId: plan.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});
	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	if (!customer.stripe_id) throw new Error("Expected Stripe customer");
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: customer.stripe_id,
		status: "active",
	});
	expect(subscriptions.data).toHaveLength(1);
	const before = subscriptions.data[0];
	const expectedAnchor = Math.floor(advancedTo / 1000);
	expect(before.billing_cycle_anchor).toBeLessThan(expectedAnchor);

	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		plan_id: plan.id,
		billing_cycle_anchor: "now",
	});

	const after = await ctx.stripeCli.subscriptions.retrieve(before.id);
	expect(after.billing_cycle_anchor).toBe(expectedAnchor);
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_2,
		featureId: "messages",
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
