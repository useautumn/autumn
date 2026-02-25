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
// Test 1: Monthly + annual plans
// Checks: preview total, post-attach products, features, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach multi-interval: monthly + annual plans")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });

	const monthlyPlan = products.pro({
		id: "monthly",
		items: [messagesItem],
	});
	const annualPlan = products.proAnnual({
		id: "annual",
		items: [wordsItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-multi-interval-basic",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [monthlyPlan, annualPlan] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: monthlyPlan.id }, { plan_id: annualPlan.id }],
	};

	// 1. Preview — $20 (monthly) + $200 (annual) = $220
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(220, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [monthlyPlan.id, annualPlan.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 220,
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
// Test 2: Monthly recurring + one-off product with prepaid storage
// Checks: preview total, post-attach products, features, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach multi-interval: monthly recurring + one-off product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const storageItem = items.oneOffStorage({
		includedUsage: 0,
		billingUnits: 100,
		price: 20,
	});

	const monthlyPlan = products.pro({
		id: "monthly",
		items: [messagesItem],
	});
	const oneOffPlan = products.oneOff({
		id: "one-off",
		items: [storageItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-multi-interval-oneoff",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [monthlyPlan, oneOffPlan] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{ plan_id: monthlyPlan.id },
			{
				plan_id: oneOffPlan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Storage, quantity: 500 },
				],
			},
		],
	};

	// 1. Preview — $20 (monthly) + $10 (one-off base) + $100 (500/100*$20) = $130
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(130, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [monthlyPlan.id, oneOffPlan.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Storage,
		balance: 500,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 130,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
