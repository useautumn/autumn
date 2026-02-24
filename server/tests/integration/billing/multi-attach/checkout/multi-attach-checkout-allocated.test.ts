import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Allocated seats via checkout — multi-attach with allocated users
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout allocated: plan with allocated seats")}`, async () => {
	const allocUsers = items.allocatedUsers({ includedUsage: 2 });
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Plan A: $20/mo + allocated users (2 included, $10/extra seat)
	const planA = products.pro({
		id: "plan-a",
		items: [allocUsers],
	});

	// Plan B: separate group with messages
	const planB = products.base({
		id: "plan-b",
		items: [messagesItem, items.monthlyPrice({ price: 15 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-co-allocated",
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	// 2 included allocated seats
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 2,
	});

	// 100 included messages
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Invoice: $20 (planA base) + $15 (planB base) = $35 (no seat overage)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 35,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Entity-level multi-attach via checkout with allocated features
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout allocated: entity-level with allocated workflows")}`, async () => {
	const freePlan = products.base({
		items: [items.freeAllocatedWorkflows({ includedUsage: 3 })],
	});
	const allocWorkflows = items.allocatedWorkflows({ includedUsage: 0 });
	const plan = products.pro({
		items: [allocWorkflows],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "ma-co-ent-allocated",
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [freePlan, plan] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: freePlan.id, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Workflows,
				value: 3,
				entityIndex: 0,
				timeout: 4000,
			}),
		],
	});

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			plans: [{ plan_id: plan.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Invoice: $20 base (no seat overage with 3 included)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20 + 3 * 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
