/**
 * Scheduled Switch Consumable Tests (Attach V2)
 *
 * Tests for downgrades involving consumable (usage-in-arrear) features.
 *
 * Key behaviors:
 * - Consumable overage is charged at cycle end via invoice-created webhook
 * - These tests verify the downgrade flow works correctly with consumable usage
 * - Overage from the old product is billed when downgrade completes
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro with consumable, usage under limit, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50 messages (under included usage)
 * - Downgrade to free
 * - Advance to cycle end
 *
 * Expected Result:
 * - Scheduled downgrade with no overage charged at cycle end
 * - After cycle: pro removed, free active
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-consumable 1: pro with consumable, usage under limit, to free")}`, async () => {
	const customerId = "sched-switch-cons-under-limit";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }), // Under included
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify balance before downgrade (100 included - 50 used = 50)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 50,
	});

	// Downgrade to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify states
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: free.id,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Now advance cycle and verify
	const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterCycle =
		await autumnV1After.customers.get<ApiCustomerV3>(customerId);

	// After cycle: free active, pro removed
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Features at free tier (50 included)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});

	// Only pro invoice ($20), no overage since usage was under included
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 2,
		latestTotal: 0,
		latestInvoiceProductIds: [pro.id],
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctxAfter.db,
		customerId,
		org: ctxAfter.org,
		env: ctxAfter.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro with consumable, into overage, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 150 messages (50 overage)
 * - Downgrade to free
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged at cycle end when downgrade completes ($5.00)
 * - After cycle: free active, overage billed to pro invoice
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-consumable 2: pro with consumable, into overage, to free")}`, async () => {
	const customerId = "sched-switch-cons-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const usageAmount = 150; // 50 overage

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: usageAmount }),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overage: 50 units * $0.10 = $5.00
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(5);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: free active, pro removed
	await expectCustomerProducts({
		customer,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Features at free tier (50 included)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});

	// Pro invoice ($20) + overage ($5) = $25
	// Note: The overage is typically added to the final invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedOverage,
		latestInvoiceProductIds: [pro.id],
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Premium with consumable overage, downgrade to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable messages (100 included, $0.10/unit overage)
 * - Track 200 messages (100 overage = $10)
 * - Downgrade to pro ($20/mo)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage billed to Premium ($10)
 * - Pro active with balance reset
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-consumable 3: premium with consumable overage, downgrade to pro")}`, async () => {
	const customerId = "sched-switch-premium-cons-to-pro";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const premium = products.premium({
		id: "premium",
		items: [consumableItem],
	});

	const proConsumable = items.consumableMessages({ includedUsage: 50 });
	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const usageAmount = 200; // 100 overage

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 5000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: usageAmount,
				timeout: 2000,
			}),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Calculate expected overage: 100 units * $0.10 = $10.00
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(10);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active, premium removed
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Features at pro tier (50 included), balance reset
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50) + overage at cycle end ($10) = $60
	// 2. Pro renewal ($20)
	// Note: The exact invoice structure depends on implementation
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20 + expectedOverage, // Pro renewal + premium overage
		latestInvoiceProductIds: [pro.id, premium.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium with consumable credits, downgrade to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable credits (200 included, $0.10/unit overage)
 * - Track 300 credits (100 overage = $10)
 * - Downgrade to pro ($20/mo) with consumable credits (100 included)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged on premium ($10) at cycle end
 * - Pro active with usage reset to 0 and balance at 100 (pro's included)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-consumable 4: premium with consumable credits, downgrade to pro")}`, async () => {
	const customerId = "sched-switch-premium-credits-to-pro";

	const premiumConsumableCredits = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: 200,
		price: 0.1,
		billingUnits: 1,
	});

	const premium = products.premium({
		id: "premium",
		items: [premiumConsumableCredits],
	});

	const proConsumableCredits = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: 100,
		price: 0.1,
		billingUnits: 1,
	});

	const pro = products.pro({
		id: "pro",
		items: [proConsumableCredits],
	});

	const usageAmount = 300; // 100 overage (300 - 200 included)

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 5000 }),
			s.track({
				featureId: TestFeature.Credits,
				value: usageAmount,
				timeout: 2000,
			}),
			s.billing.attach({ productId: pro.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Calculate expected overage: 100 units * $0.10 = $10.00
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(10);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active, premium removed
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Features at pro tier (100 included), usage reset to 0
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Credits,
		balance: 100,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50) initial
	// 2. Pro renewal ($20) + premium overage ($10) = $30
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20 + expectedOverage,
		latestInvoiceProductIds: [pro.id, premium.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium with consumable credits, downgrade to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable credits (200 included, $0.10/unit overage)
 * - Track 350 credits (150 overage = $15)
 * - Downgrade to free (50 monthly credits, no overage)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged on premium ($15) at cycle end
 * - Free active with usage reset to 0 and balance at 50 (free's included)
 * - No Stripe subscription after downgrade to free
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-consumable 5: premium with consumable credits, downgrade to free")}`, async () => {
	const customerId = "sched-switch-premium-credits-to-free";

	const premiumConsumableCredits = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: 200,
		price: 0.1,
		billingUnits: 1,
	});

	const premium = products.premium({
		id: "premium",
		items: [premiumConsumableCredits],
	});

	const freeCredits = items.monthlyCredits({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeCredits],
	});

	const usageAmount = 350; // 150 overage (350 - 200 included)

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, timeout: 5000 }),
			s.track({
				featureId: TestFeature.Credits,
				value: usageAmount,
				timeout: 2000,
			}),
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overage: 150 units * $0.10 = $15.00
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(15);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: free active, premium removed
	await expectCustomerProducts({
		customer,
		active: [free.id],
		notPresent: [premium.id],
	});

	// Features at free tier (50 included), usage reset to 0
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Credits,
		balance: 50,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50) initial
	// 2. Premium overage ($15) at cycle end
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedOverage,
		latestInvoiceProductIds: [premium.id],
	});

	// After downgrading to free, there should be no Stripe subscription
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
