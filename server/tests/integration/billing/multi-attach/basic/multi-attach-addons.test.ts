import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Two add-ons when customer has main recurring
// Checks: preview total, post-attach all three products active,
//         features, invoice (2 invoices total), sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach addons: two add-ons when customer has main recurring")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const dashboardItem = items.dashboard();

	const mainPlan = products.pro({
		id: "main",
		items: [messagesItem],
	});
	const addonA = products.recurringAddOn({
		id: "addon-a",
		items: [wordsItem],
	});
	const addonB = products.oneOffAddOn({
		id: "addon-b",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-addon-two-addons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, addonA, addonB] }),
		],
		actions: [s.billing.attach({ productId: mainPlan.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: addonA.id }, { plan_id: addonB.id }],
	};

	// 1. Preview — $20 (recurring addon) + $10 (one-off addon) = $30
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(30, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, addonA.id, addonB.id],
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

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Invoice count: 1 (main attach) + 1 (multi-attach addons) = 2
	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
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
// Test 2: Add-on + main recurring when customer already has add-on
// Checks: preview total, post-attach all three products active,
//         features, invoice (2 invoices total), sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach addons: add-on + main recurring when customer has add-on")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const dashboardItem = items.dashboard();

	const existingAddon = products.recurringAddOn({
		id: "existing-addon",
		items: [dashboardItem],
	});
	const mainPlan = products.pro({
		id: "main",
		items: [messagesItem],
	});
	const newAddon = products.oneOffAddOn({
		id: "new-addon",
		items: [wordsItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-addon-plus-main",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [existingAddon, mainPlan, newAddon] }),
		],
		actions: [s.billing.attach({ productId: existingAddon.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: mainPlan.id }, { plan_id: newAddon.id }],
	};

	// 1. Preview — $20 (main) + $10 (new addon one-off) = $30
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(30, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [existingAddon.id, mainPlan.id, newAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Invoice count: 1 (existing addon) + 1 (multi-attach) = 2
	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
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
// Test 3: Multiple recurring add-ons (no main plan)
// Checks: preview total, post-attach products, features, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach addons: multiple recurring add-ons without main plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 50 });

	const addonA = products.recurringAddOn({
		id: "addon-a",
		items: [messagesItem],
	});
	const addonB = products.recurringAddOn({
		id: "addon-b",
		items: [wordsItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-addon-multi-recurring",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addonA, addonB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: addonA.id }, { plan_id: addonB.id }],
	};

	// 1. Preview — $20 (addonA) + $20 (addonB) = $40
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(40, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [addonA.id, addonB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
