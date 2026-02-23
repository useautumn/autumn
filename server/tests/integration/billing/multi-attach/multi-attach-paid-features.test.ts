import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Prepaid features across two plans
// Checks: preview with prepaid cost, post-attach products, feature
//         balances, invoice reflecting base + prepaid charges, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach paid features: prepaid across two plans")}`, async () => {
	// Plan A: $20/mo recurring + prepaid messages ($10/100 units)
	const prepaidMsgs = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const planA = products.pro({ id: "plan-a", items: [prepaidMsgs] });

	// Plan B: $15/mo + prepaid words ($10/100 units)
	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		billingUnits: 100,
		price: 10,
		includedUsage: 0,
	});
	const planB = products.base({
		id: "plan-b",
		items: [prepaidWords, items.monthlyPrice({ price: 15 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-paid-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
			{
				plan_id: planB.id,
				feature_quantities: [{ feature_id: TestFeature.Words, quantity: 300 }],
			},
		],
	};

	// 1. Preview — $20 (planA base) + $20 (200/100*$10) + $15 (planB base) + $30 (300/100*$10) = $85
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(85, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 300,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 85,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Prepaid + consumable + allocated across separate plans
// Checks: preview total (base + prepaid, no consumable/allocated
//         charge at attach), post-attach products, all feature
//         balances, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach paid features: prepaid + consumable + allocated in separate plans")}`, async () => {
	// Plan A: $20/mo + prepaid messages
	const prepaidMsgs = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const planA = products.pro({ id: "plan-a", items: [prepaidMsgs] });

	// Plan B: $30/mo + consumable words (100 included, $0.05/unit overage)
	//         + allocated users (3 included, $10/seat)
	const consumWords = items.consumableWords({ includedUsage: 100 });
	const allocUsers = items.allocatedUsers({ includedUsage: 3 });
	const planB = products.base({
		id: "plan-b",
		items: [consumWords, allocUsers, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-paid-combo",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
			{ plan_id: planB.id },
		],
	};

	// 1. Preview — $20 (planA base) + $50 (500/100*$10 prepaid) + $30 (planB base) = $100
	//    Consumable and allocated not charged at attach time
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(100, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	// Prepaid messages: 500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	// Consumable words: 100 included (billed at cycle end, not at attach)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// Allocated users: 3 included seats
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 3,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 100,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
