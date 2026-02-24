/**
 * Legacy Attach V1 Downgrade Tests (Customer-Level)
 *
 * Migrated from:
 * - server/tests/attach/downgrade/downgrade1.test.ts (premium -> pro, advance clock)
 * - server/tests/attach/downgrade/downgrade2.test.ts (premium -> free, advance clock)
 * - server/tests/attach/downgrade/downgrade3.test.ts (chain: premium -> pro -> free -> pro -> premium)
 * - server/tests/attach/downgrade/downgrade4.test.ts (quarterly -> premium -> pro, mixed intervals)
 * - server/tests/attach/downgrade/downgrade5.test.ts (premium -> pro schedule, renew, advance clock)
 *
 * Tests V1 attach downgrade behavior for customer-level subscriptions:
 * - Scheduled downgrades (current product canceling, new product scheduled)
 * - Clock advancement to activate scheduled downgrades
 * - Renewing to cancel scheduled downgrades
 * - Mixed billing intervals (quarterly -> monthly)
 */

import { test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Premium -> Pro, advance clock
// (from downgrade1)
//
// Scenario:
// - Premium ($50/month) with consumable Words
// - Pro ($20/month) with consumable Words
// - Attach Premium, then downgrade to Pro (scheduled)
// - Advance clock to next cycle
//
// Expected:
// - Premium is canceling (scheduled for end of cycle)
// - Pro is scheduled
// - After clock advance: Pro is active, Premium is gone
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 1: premium -> pro, advance clock")}`, async () => {
	const customerId = "legacy-downgrade-1";

	const wordsItem = items.consumableWords();
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Downgrade to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify: Premium canceling, Pro scheduled
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer: customerBefore,
		productId: pro.id,
	});

	// Advance clock to next cycle
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 30,
	});

	// Verify: Pro is active, Premium is gone
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfter,
		productId: premium.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium -> Free, advance clock
// (from downgrade2)
//
// Scenario:
// - Premium ($50/month) with consumable Words
// - Free (no price) with Words (100 included)
// - Attach Premium, then downgrade to Free (scheduled)
// - Advance clock to next cycle
//
// Expected:
// - Premium is canceling
// - Free is scheduled
// - After clock advance: Free is active with 100 Words balance
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 2: premium -> free, advance clock")}`, async () => {
	const customerId = "legacy-downgrade-2";

	const wordsConsumable = items.consumableWords();
	const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
	const premium = products.premium({ id: "premium", items: [wordsConsumable] });
	const free = products.base({ id: "free", items: [wordsIncluded] });

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium, free] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Downgrade to Free
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	// Verify: Premium canceling, Free scheduled
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer: customerBefore,
		productId: free.id,
	});

	// Advance clock to next cycle
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 30,
	});

	// Verify: Free is active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: free.id,
	});

	await expectProductNotPresent({
		customer: customerAfter,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Words,
		balance: 100,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Chain: Premium -> Pro -> Free -> Pro -> Premium
// (from downgrade3)
//
// Scenario:
// - Premium ($50/month), Pro ($20/month), Free (no price)
// - Attach Premium
// - Downgrade to Pro (scheduled)
// - Change downgrade to Free (scheduled)
// - Change downgrade to Pro (scheduled)
// - Renew Premium (cancels schedule)
//
// Expected:
// - Each downgrade replaces the previous schedule
// - Renewing cancels all scheduled downgrades
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 3: chain premium -> pro -> free -> pro -> premium")}`, async () => {
	const customerId = "legacy-downgrade-3";

	const wordsConsumable = items.consumableWords();
	const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
	const premium = products.premium({ id: "premium", items: [wordsConsumable] });
	const pro = products.pro({ id: "pro", items: [wordsConsumable] });
	const free = products.base({ id: "free", items: [wordsIncluded] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium, pro, free] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Step 1: Downgrade to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });

	// Step 2: Change downgrade to Free
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: free.id });
	await expectProductNotPresent({ customer, productId: pro.id });

	// Step 3: Change downgrade to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	await expectProductNotPresent({ customer, productId: free.id });

	// Step 4: Renew Premium (cancels scheduled downgrade)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: premium.id });
	await expectProductNotPresent({ customer, productId: pro.id });
	await expectProductNotPresent({ customer, productId: free.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro-Quarter -> Premium -> Pro (mixed intervals)
// (from downgrade4)
//
// Scenario:
// - Pro-Quarter ($20/quarter) with consumable Words
// - Premium ($50/month) with consumable Words
// - Pro ($20/month) with consumable Words
// - Attach Pro-Quarter
// - Downgrade to Premium (scheduled for end of quarter)
// - Change downgrade to Pro (scheduled for end of quarter)
// - Advance clock 3 months
//
// Expected:
// - After 3 months: Pro (monthly) is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 4: pro-quarter -> premium -> pro (mixed intervals)")}`, async () => {
	const customerId = "legacy-downgrade-4";

	const wordsItem = items.consumableWords();

	// Quarterly pro product - use constructProduct directly with interval parameter
	const proQuarter = constructProduct({
		id: "pro-quarter",
		items: [wordsItem],
		type: "pro",
		interval: BillingInterval.Quarter,
		isDefault: false,
	});

	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proQuarter, premium, pro] }),
		],
		actions: [s.attach({ productId: proQuarter.id })],
	});

	// Downgrade to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: proQuarter.id });
	await expectProductScheduled({ customer, productId: premium.id });

	// Change downgrade to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: proQuarter.id });
	await expectProductScheduled({ customer, productId: pro.id });

	// Advance clock 3 months (end of quarter) - advance 1.5 months twice
	const advancedTo = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 6,
		waitForSeconds: 30,
	});
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addWeeks(advancedTo, 7).getTime(),
		waitForSeconds: 30,
	});

	// Verify: Pro (monthly) is active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfter,
		productId: proQuarter.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium -> Pro schedule, renew removes schedule, advance clock
// (from downgrade5)
//
// Scenario:
// - Premium ($50/month) with Messages (100 included)
// - Pro ($20/month) with Dashboard, Messages (10), Admin (unlimited)
// - Attach Premium
// - Downgrade to Pro (scheduled)
// - Renew Premium (removes scheduled Pro)
// - Downgrade to Pro again
// - Advance clock
//
// Expected:
// - Renewing cancels the scheduled downgrade
// - After final downgrade and clock advance: Pro is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 5: premium -> pro schedule, renew, advance clock")}`, async () => {
	const customerId = "legacy-downgrade-5";

	const dashboardItem = items.dashboard();
	const messagesItemPro = items.monthlyMessages({ includedUsage: 10 });
	const adminItem = items.adminRights();
	const messagesItemPremium = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItemPro, adminItem],
	});
	const premium = products.premium({
		id: "premium",
		items: [messagesItemPremium],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Step 1: Downgrade to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });

	// Verify Premium is still the active product with correct features
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Step 2: Renew Premium (cancels scheduled Pro)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: premium.id });
	await expectProductNotPresent({ customer, productId: pro.id });

	// Step 3: Downgrade to Pro again
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });

	// Step 4: Advance clock to next cycle
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 30,
	});

	// Verify: Pro is active with correct features
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfter,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 10,
	});
});
