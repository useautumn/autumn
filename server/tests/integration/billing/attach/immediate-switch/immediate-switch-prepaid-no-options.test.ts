/**
 * Immediate Switch Prepaid No-Options Tests (Attach V2)
 *
 * Tests for upgrades involving prepaid features where options are NOT passed on upgrade.
 *
 * IMPORTANT: Immediate switch always involves a DIFFERENT product.
 * You cannot update quantity on the same product via attach.
 *
 * Key behaviors:
 * - When no options passed on upgrade, quantity carries over from previous product
 * - When partial options passed, only specified features change
 * - Balance should be recalculated based on new product config + carried-over quantity
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro with prepaid (200 units), upgrade to Premium with NO options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units purchased)
 * - Upgrade to Premium with prepaid, NO options passed
 *
 * Expected Result:
 * - Quantity carries over (200 units)
 * - Balance = 200 (same as before)
 * - Only base price difference charged (prepaid quantity unchanged)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 1: quantity carries over")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-carry";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial state: 200 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade - NO options passed
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		// No options - quantity should carry over
	});
	// Base diff: $50 - $20 = $30 (prepaid quantity same, no prepaid diff)
	expect(preview.total).toBe(30);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
		// No options
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance carried over: 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Invoices: initial ($20 base + $20 prepaid = $40) + upgrade ($30 base only)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid upgrade no options, billing units change (100 → 50)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ 100 units/pack = 2 packs)
 * - Upgrade to Premium with prepaid (50 units/pack), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 units
 * - New product has 4 packs (200 / 50)
 * - Prepaid cost increases (4 packs vs 2 packs)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 2: billing units 100 to 50")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-units-100-50";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial: 200 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (4 packs - 2 packs) * $10 = $20
	// Total: $50
	expect(preview.total).toBe(50);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance carried over: 200 units (same quantity)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid upgrade no options, billing units change (50 → 100)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ 50 units/pack = 4 packs)
 * - Upgrade to Premium with prepaid (100 units/pack), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 units
 * - New product has 2 packs (200 / 100)
 * - Prepaid cost decreases (2 packs vs 4 packs)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 3: billing units 50 to 100")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-units-50-100";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (2 packs - 4 packs) * $10 = -$20
	// Total: $10
	expect(preview.total).toBe(10);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance carried over: 200 units
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid upgrade no options, included usage increases
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (0 included, 200 purchased = 200 total)
 * - Upgrade to Premium with prepaid (100 included), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 purchased
 * - Balance = 100 (included) + 200 (purchased) = 300
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 4: included usage increases")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-incl-inc";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial: 200 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Diff: $50 + $10 - $20 - $20 = $20
	// Prepaid: same 2 packs (quantity carried over), no diff
	expect(preview.total).toBe(20);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance: 100 included + 200 carried over = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prepaid upgrade no options, included usage decreases
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (100 included, 200 purchased = 300 total)
 * - Upgrade to Premium with prepaid (0 included), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 purchased
 * - Balance = 0 (included) + 200 (purchased) = 200
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 5: included usage decreases")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-incl-dec";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial: 100 included + 200 purchased = 300
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 + $20 - $20 - $10
	// Prepaid: same 2 packs, no diff
	expect(preview.total).toBe(40);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance: 0 included + 200 purchased = 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid upgrade no options, price change
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ $10/pack = 2 packs = $20)
 * - Upgrade to Premium with prepaid ($15/pack), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 units (2 packs)
 * - Price diff charged: 2 packs * ($15 - $10) = $10
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 6: price increases")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-price-inc";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 2 packs * ($15 - $10) = $10
	// Total: $40
	expect(preview.total).toBe(40);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance carried over: 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Prepaid upgrade no options, price decreases
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ $15/pack = 2 packs = $30)
 * - Upgrade to Premium with prepaid ($10/pack), NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 units
 * - Credit for price diff: 2 packs * ($10 - $15) = -$10
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 7: price decreases")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-price-dec";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 2 packs * ($10 - $15) = -$10
	// Total: $20
	expect(preview.total).toBe(20);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance carried over: 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Prepaid with usage, upgrade no options - balance preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 purchased)
 * - Track 50 usage (balance = 150)
 * - Upgrade to Premium with prepaid, NO options
 *
 * Expected Result:
 * - Quantity carries over: 200 purchased (usage resets for prepaid on upgrade)
 * - Balance = 200 (prepaid resets usage)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 8: with usage")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-with-usage";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track 50 usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade: balance = 150
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 50,
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid: same quantity carried over, no diff
	expect(preview.total).toBe(30);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance: 200 (usage resets on upgrade)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Multiple prepaid features, upgrade with partial options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 2 prepaid features:
 *   - Messages: 200 purchased
 *   - Words: 500 purchased
 * - Upgrade to Premium, only specify messages option (increase to 300)
 *
 * Expected Result:
 * - Messages: changed to 300
 * - Words: carries over at 500
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 9: multiple prepaid partial options")}`, async () => {
	const customerId = "imm-switch-prepaid-partial-opts";

	const proMessagesPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proWordsPrepaid = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 5,
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesPrepaid, proWordsPrepaid],
	});

	const premiumMessagesPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premiumWordsPrepaid = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 5,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesPrepaid, premiumWordsPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
					{ feature_id: TestFeature.Words, quantity: 500 },
				],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
	});
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Words,
		balance: 500,
	});

	// 1. Preview upgrade - ONLY messages option (words should carry over)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});
	// Base diff: $50 - $20 = $30
	// Messages: (3 packs - 2 packs) * $10 = $10
	// Words: carried over (no change)
	expect(preview.total).toBe(40);

	// 2. Attach premium - only messages option
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify messages changed to 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
	});

	// Verify words carried over at 500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 500,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Prepaid upgrade no options, all config changes (billing units, price, included)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid:
 *   - 0 included, 200 purchased @ 100 units/pack @ $10/pack
 *   - Total: 200 units, 2 packs, $20 prepaid
 * - Upgrade to Premium with prepaid (NO options):
 *   - 50 included, 50 units/pack @ $15/pack
 *
 * Expected Result:
 * - Quantity carries over: 200 purchased
 * - New packs: 200 / 50 = 4 packs
 * - Balance = 50 (included) + 200 (purchased) = 250
 * - Prepaid diff: (4 packs * $15) - (2 packs * $10) = $60 - $20 = $40
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 10: all config changes")}`, async () => {
	const customerId = "imm-switch-prepaid-no-opts-all-change";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 50,
		billingUnits: 50,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial: 200 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade - NO options
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (4 * $15) - (2 * $10) = $60 - $20 = $40
	// Total: $70
	expect(preview.total).toBe(70);

	// 2. Attach premium - NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance: 50 included + 200 purchased = 250
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 250,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: Prepaid upgrade with options set to 0 (explicit reset)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 purchased)
 * - Upgrade to Premium with options explicitly set to 0
 *
 * Expected Result:
 * - Quantity set to 0 (not carried over because explicit)
 * - Credit for removed prepaid
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid-no-options 11: options explicitly set to 0")}`, async () => {
	const customerId = "imm-switch-prepaid-opts-zero";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial: 200 units
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	// 1. Preview upgrade - options explicitly 0
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (0 packs - 2 packs) * $10 = -$20
	// Total: $10
	expect(preview.total).toBe(10);

	// 2. Attach premium - options explicitly 0
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance: 0 (explicitly set)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});
});
