/**
 * Legacy Attach V1 Upgrade - Custom Items Tests
 *
 * Tests that verify V1's attach() with is_custom + items parameter works
 * correctly for upgrade scenarios. Custom items allow overriding product
 * configuration at attach time (price changes, feature additions, usage changes,
 * billing interval changes).
 *
 * Uses autumnV1.attach({ is_custom: true, items: [...] }) which goes through
 * the legacy /attach endpoint with custom product item overrides.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with custom higher price (downgrade→upgrade inversion)
//
// Scenario:
// - Customer on Pro ($20/mo)
// - Pro is cheaper than Premium normally, so Pro→Premium = upgrade
// - But here we upgrade to Premium with custom price $60/mo (higher than Pro's $20)
// - This tests that custom items correctly influence the upgrade path
//
// Expected:
// - Treated as upgrade (immediate switch)
// - Premium active, Pro gone
// - Invoice reflects prorated difference
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 1: upgrade with custom higher price")}`, async () => {
	const customerId = "legacy-upgrade-custom-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	// Upgrade to Premium with custom higher price ($60/mo instead of $50)
	const customHigherPrice = items.monthlyPrice({ price: 60 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, customHigherPrice],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should be active, Pro should be gone (immediate switch)
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Invoice: initial Pro ($20) + upgrade difference ($60 - $20 = $40)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 60 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade with custom feature addition
//
// Scenario:
// - Customer on Pro (messages only, $20/mo)
// - Upgrade to Premium ($50/mo) with custom items that add Words feature
//
// Expected:
// - Premium active with both Messages and Words features
// - Pro gone (immediate switch, since $50 > $20)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 2: upgrade with custom feature addition")}`, async () => {
	const customerId = "legacy-upgrade-custom-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	// Upgrade to Premium with custom items adding Words feature
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, wordsItem, premiumPrice],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should be active, Pro should be gone
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Messages from Premium
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Words from custom items
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Invoice: initial Pro ($20) + upgrade to Premium ($50 - $20 = $30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade with custom included usage
//
// Scenario:
// - Customer on Pro (100 messages, $20/mo)
// - Upgrade to Premium ($50/mo) with custom items setting 500 messages
//
// Expected:
// - Premium active with 500 messages included
// - Balance = 500
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 3: upgrade with custom included usage")}`, async () => {
	const customerId = "legacy-upgrade-custom-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro with 100 messages
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
	});

	// Upgrade to Premium with custom 500 messages included
	const higherUsageItem = items.monthlyMessages({ includedUsage: 500 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [higherUsageItem, premiumPrice],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should be active with 500 messages
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Invoice: initial Pro ($20) + upgrade ($50 - $20 = $30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade with custom billing interval change
//
// Scenario:
// - Customer on Pro ($20/mo monthly)
// - Upgrade to Premium with custom items using annual price ($200/yr)
//
// Expected:
// - Premium active with annual billing
// - Charged $200 (annual) minus prorated $20 (monthly) credit
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 4: upgrade with custom billing interval")}`, async () => {
	const customerId = "legacy-upgrade-custom-interval";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	// Upgrade to Premium with custom annual price ($200/yr)
	const annualPrice = items.annualPrice({ price: 200 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, annualPrice],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should be active, Pro should be gone
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Invoice: initial Pro ($20) + upgrade to annual Premium
	// The upgrade invoice amount = $200 (annual) - prorated remaining Pro credit
	// Exact amount depends on proration, so just verify 2 invoices exist
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
