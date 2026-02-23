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
// Test 1: Two recurring plans in different groups
// Checks: preview total, post-attach products, features, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach basic: two recurring plans in different groups")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const usersItem = items.monthlyUsers({ includedUsage: 10 });

	const planA = products.pro({ id: "plan-a", items: [messagesItem] });
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-basic-two-recurring",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
	};

	// 1. Preview — $20 (planA) + $30 (planB) = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(50, 0);

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
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 10,
	});

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
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: One-off add-on + main recurring
// Checks: preview total, post-attach products, features, invoice, sub
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach basic: one-off add-on + main recurring")}`, async () => {
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
		customerId: "ma-basic-oneoff-recurring",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [recurring, oneOffAddon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: recurring.id }, { plan_id: oneOffAddon.id }],
	};

	// 1. Preview — $20 (recurring) + $10 (one-off addon) = $30
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(30, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
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
		flags: { checkNotTrialing: true },
	});
});
