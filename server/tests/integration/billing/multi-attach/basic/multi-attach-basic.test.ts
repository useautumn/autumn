import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
	console.log("preview", preview);
	expect(preview.total).toEqual(50);

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

	await expectCustomerInvoiceCorrect({
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

	await expectCustomerInvoiceCorrect({
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

// ═══════════════════════════════════════════════════════════════════
// Test 3: Free → Pro + recurring add-on (single transition)
// Customer starts on free plan, multi-attach pro + addon.
// Free should expire, pro + addon should be active.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach basic: free → pro + recurring add-on")}`, async () => {
	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const addonWords = items.monthlyWords({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [freeMessages],
		isDefault: false,
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonWords],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-basic-free-to-pro",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
	};

	// 1. Preview — $20 (pro) + $20 (addon) = $40
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(40, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// Free plan had no invoice, so only 1 invoice from multi-attach ($40)
	await expectCustomerInvoiceCorrect({
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

// ═══════════════════════════════════════════════════════════════════
// Test 4: Pro → Premium + recurring add-on (paid transition)
// Customer starts on pro ($20), multi-attach premium ($50) + addon ($20).
// Pro should expire (notPresent), premium + addon should be active.
// Invoice 1 = initial pro attach ($20), Invoice 2 = upgrade diff + addon ($50)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach basic: pro → premium + recurring add-on")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const addonWords = items.monthlyWords({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonWords],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-basic-pro-to-premium",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
	};

	// 1. Preview — ($50 - $20 refund) + $20 addon = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(50, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id, addon.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// Invoice 1 = initial pro ($20), Invoice 2 = upgrade ($50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
// Test 5: Pro → scheduled downgrade to Free → multi-attach Premium + addon
// Customer on pro ($20), downgrades to free (scheduled).
// Then multi-attach premium ($50) + addon ($20).
// Pro expires, scheduled free is deleted, premium + addon active.
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach basic: pro → scheduled free → multi-attach premium + addon")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const addonWords = items.monthlyWords({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});
	const free = products.base({
		id: "free",
		items: [freeMessages],
		isDefault: false,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonWords],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-basic-pro-sched-free-to-prem",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, premium, addon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: free.id }), // downgrade → scheduled
		],
	});

	// Verify intermediate state: pro canceling, free scheduled
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer: customerBefore, productId: pro.id });
	await expectProductScheduled({
		customer: customerBefore,
		productId: free.id,
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
	};

	// 1. Preview — ($50 - $20 refund) + $20 addon = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(50);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id, addon.id],
		notPresent: [pro.id, free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// Invoice 1 = initial pro ($20), Invoice 2 = upgrade ($50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
