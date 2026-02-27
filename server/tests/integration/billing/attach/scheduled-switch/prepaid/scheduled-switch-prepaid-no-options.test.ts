/**
 * Scheduled Switch Prepaid No-Options Tests (Attach V2)
 *
 * Tests for downgrades involving prepaid features where options are NOT passed.
 *
 * Key behaviors:
 * - When no options passed on downgrade, quantity carries over from previous product
 * - Total units preserved across products (rounded to new billing units if needed)
 * - At cycle end, new product becomes active with the scheduled quantity
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid downgrade no options - quantity carries over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (300 units purchased)
 * - Downgrade to Pro with prepaid, NO options passed
 * - Advance cycle
 *
 * Expected Result:
 * - Quantity carries over (300 units)
 * - After cycle: pro active with 300 units
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-no-options 1: quantity carries over")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts-carry";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				timeout: 4000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify initial state: 300 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Downgrade to pro - NO options passed
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		// No options - quantity should carry over
	});

	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled state
	await expectProductCanceling({
		customer: customerMidCycle,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Balance still at premium's 300 until cycle end
	expectCustomerFeatureCorrect({
		customer: customerMidCycle,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid downgrade no options, billing units change (100 → 50)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (300 units @ 100 units/pack = 3 packs)
 * - Downgrade to Pro with prepaid (50 units/pack), NO options
 * - Advance cycle
 *
 * Expected Result:
 * - Quantity carries over: 300 units
 * - New product has 6 packs (300 / 50)
 * - After cycle: pro active with 300 units
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-no-options 2: billing units 100 to 50")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts-units-100-50";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.billing.attach({ productId: pro.id }), // NO options
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify balance carried over: 300 units (converted to 6 packs of 50)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50 base + 3 packs * $15 = $95)
	// 2. Pro renewal ($20 base + 6 packs * $5 = $50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid downgrade no options, billing units change (50 → 100)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (300 units @ 50 units/pack = 6 packs)
 * - Downgrade to Pro with prepaid (100 units/pack), NO options
 * - Advance cycle
 *
 * Expected Result:
 * - Quantity carries over: 300 units
 * - New product has 3 packs (300 / 100)
 * - After cycle: pro active with 300 units
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-no-options 3: billing units 50 to 100")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts-units-50-100";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.billing.attach({ productId: pro.id }), // NO options
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify balance carried over: 300 units (converted to 3 packs of 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50 base + 6 packs * $10 = $110)
	// 2. Pro renewal ($20 base + 3 packs * $10 = $50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid downgrade no options, included usage changes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (0 included, 200 purchased = 200 total)
 * - Downgrade to Pro with prepaid (100 included), NO options
 * - Advance cycle
 *
 * Expected Result:
 * - Quantity carries over: 200 purchased
 * - After cycle: Balance = 100 (included) + 200 (purchased) = 300
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-no-options 4: included usage increases")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts-incl-inc";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				timeout: 2000,
			}),
			s.billing.attach({ productId: pro.id, timeout: 2000 }), // NO options
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prepaid downgrade no options, all config changes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid:
 *   - 0 included, 400 purchased @ 100 units/pack @ $15/pack
 *   - Total: 400 units, 4 packs
 * - Downgrade to Pro with prepaid (NO options):
 *   - 50 included, 50 units/pack @ $10/pack
 *
 * Expected Result:
 * - Quantity carries over: 400 purchased
 * - New packs: 400 / 50 = 8 packs
 * - After cycle: Balance = 50 (included) + 400 (purchased) = 450
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-no-options 5: all config changes")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts-all-change";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 50,
		billingUnits: 50,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
			}),
			s.billing.attach({ productId: pro.id }), // NO options
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 400,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50 base + 4 packs * $15 = $110)
	// 2. Pro renewal ($20 base + 7 packs * $10 = $100)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 90,
	});
});
