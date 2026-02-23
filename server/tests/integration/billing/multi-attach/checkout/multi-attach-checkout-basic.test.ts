import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
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
// Test 1: One-off add-on + main recurring via checkout
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout: one-off add-on + main recurring")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const dashboardItem = items.dashboard();

	const recurring = products.pro({
		id: "recurring",
		items: [messagesItem],
	});
	const oneOffAddon = products.oneOffAddOn({
		id: "one-off-addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-co-oneoff-recurring",
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [recurring, oneOffAddon] }),
		],
		actions: [],
	});

	// Preview should show combined total
	const preview = await autumnV1.billing.previewMultiAttach({
		customer_id: customerId,
		plans: [{ plan_id: recurring.id }, { plan_id: oneOffAddon.id }],
	});
	expect(preview.total).toBeCloseTo(30, 0); // $20 + $10

	// Multi-attach should return checkout URL
	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: recurring.id }, { plan_id: oneOffAddon.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// Verify both products attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [recurring.id, oneOffAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Two main recurrings (different groups) via checkout
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout: two recurrings in different groups")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const planA = products.pro({
		id: "plan-a",
		items: [messagesItem],
	});
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-co-two-recurrings",
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

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 5,
	});

	// Invoice: $20 + $30 = $50
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 3: Two plans with prepaid features via checkout
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout: two plans with prepaid features")}`, async () => {
	const prepaidMsgs = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		billingUnits: 100,
		price: 5,
		includedUsage: 0,
	});

	const planA = products.pro({
		id: "plan-a",
		items: [prepaidMsgs],
	});
	const planB = products.base({
		id: "plan-b",
		items: [prepaidWords, items.monthlyPrice({ price: 10 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-co-prepaid",
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [
				{
					plan_id: planA.id,
					feature_quantities: [
						{
							feature_id: TestFeature.Messages,
							quantity: 200,
							adjustable: true,
						},
					],
				},
				{
					plan_id: planB.id,
					feature_quantities: [
						{ feature_id: TestFeature.Words, quantity: 300 },
					],
				},
			],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: 4,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 400,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 300,
	});

	// Invoice: $20 (planA base) + $20 (200/100 * $10 msgs) + $10 (planB base) + $15 (300/100 * $5 words) = $65
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 65,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
