/**
 * Immediate Switch Prepaid Tests (Attach V2)
 *
 * Tests for upgrades involving prepaid features.
 *
 * IMPORTANT: Immediate switch always involves a DIFFERENT product.
 * You cannot update quantity on the same product via attach.
 *
 * Key behaviors:
 * - Prepaid items require options with quantity
 * - Quantity represents actual units, not packs
 * - Upgrading calculates price difference (refund old + charge new)
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
// TEST 1: Free to Pro with prepaid (quantity 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free product
 * - Upgrade to pro with prepaid, quantity 0
 *
 * Expected Result:
 * - Only base price charged ($20)
 * - Balance = 0
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 1: free to pro with prepaid, quantity 0")}`, async () => {
	const customerId = "imm-switch-prepaid-free-pro-0";

	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(20);

	// 2. Attach pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro with prepaid (200) to Premium with prepaid (500)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units = 2 packs @ $10 = $20)
 * - Upgrade to premium with prepaid (500 units = 5 packs @ $10 = $50)
 *
 * Expected Result:
 * - Base diff: $50 - $20 = $30
 * - Prepaid diff: (5-2) packs * $10 = $30
 * - Total: $60
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 2: pro prepaid 200 to premium prepaid 500")}`, async () => {
	const customerId = "imm-switch-prepaid-increase-qty";

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

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (5 - 2) packs * $10 = $30
	// Total: $60
	expect(preview.total).toBe(60);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Invoices: initial ($20 base + $20 prepaid = $40) + upgrade ($60)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 60,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro with prepaid (500) to Premium with prepaid (200)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (500 units = 5 packs @ $10 = $50)
 * - Upgrade to premium with prepaid (200 units = 2 packs @ $10 = $20)
 *
 * Expected Result:
 * - Base diff: $50 - $20 = $30
 * - Prepaid diff: (2-5) packs * $10 = -$30
 * - Total: $0
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 3: pro prepaid 500 to premium prepaid 200")}`, async () => {
	const customerId = "imm-switch-prepaid-decrease-qty";

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
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (2 - 5) packs * $10 = -$30
	// Total: $0
	expect(preview.total).toBe(0);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Invoices: initial ($20 + $50 = $70) + upgrade ($0)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid billing units change (100 → 50), same quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ 100 units/pack = 2 packs @ $10)
 * - Upgrade to premium with prepaid (200 units @ 50 units/pack = 4 packs @ $10)
 *
 * Expected Result:
 * - Same units but more packs = higher cost
 * - Net charge = base diff + (4-2) packs
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 4: prepaid billing units 100 to 50")}`, async () => {
	const customerId = "imm-switch-prepaid-units-100-50";

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

	// 1. Preview upgrade - same 200 units but different billing units
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (4 packs - 2 packs) * $10 = $20
	// Total: $50
	expect(preview.total).toBe(50);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify messages balance = 200 (same units)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prepaid billing units change (50 → 100), same quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ 50 units/pack = 4 packs @ $10)
 * - Upgrade to premium with prepaid (200 units @ 100 units/pack = 2 packs @ $10)
 *
 * Expected Result:
 * - Same units but fewer packs = lower prepaid cost
 * - Net = base diff + prepaid credit
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 5: prepaid billing units 50 to 100")}`, async () => {
	const customerId = "imm-switch-prepaid-units-50-100";

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

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (2 packs - 4 packs) * $10 = -$20
	// Total: $10
	expect(preview.total).toBe(10);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid price increase (same quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ $10/pack = 2 packs)
 * - Upgrade to premium with prepaid (200 units @ $15/pack = 2 packs)
 *
 * Expected Result:
 * - Same packs but higher price per pack
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 6: prepaid price increase")}`, async () => {
	const customerId = "imm-switch-prepaid-price-inc";

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

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 2 packs * ($15 - $10) = $10
	// Total: $40
	expect(preview.total).toBe(40);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Prepaid price decrease (same quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ $15/pack = 2 packs)
 * - Upgrade to premium with prepaid (200 units @ $10/pack = 2 packs)
 *
 * Expected Result:
 * - Credit for price difference per pack
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 7: prepaid price decrease")}`, async () => {
	const customerId = "imm-switch-prepaid-price-dec";

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

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 2 packs * ($10 - $15) = -$10
	// Total: $20
	expect(preview.total).toBe(20);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Prepaid included usage increase (same total quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (0 included, quantity 200 = 2 packs @ $10 = $20)
 * - Upgrade to premium with prepaid (100 included, quantity 200)
 *   - With 100 included, quantity 200 means only 1 pack purchased (100 extra)
 *
 * Expected Result:
 * - Old: 2 packs @ $10 = $20 prepaid
 * - New: 1 pack @ $10 = $10 prepaid (100 included covers first 100)
 * - Prepaid diff: $10 - $20 = -$10 (refund)
 * - Base diff: $50 - $20 = $30
 * - Total: $20
 * - Balance = 200 (100 included + 100 purchased)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 8: prepaid included increase")}`, async () => {
	const customerId = "imm-switch-prepaid-included-inc";

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

	// 1. Preview upgrade with same quantity 200
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 1 pack ($10) - 2 packs ($20) = -$10
	// Total: $20
	expect(preview.total).toBe(20);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify messages: balance = 200 (100 included + 100 purchased from 1 pack)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Prepaid included usage decrease (same total quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (100 included, quantity 200 = 1 pack @ $10 = $10)
 * - Upgrade to premium with prepaid (0 included, quantity 200 = 2 packs @ $10 = $20)
 *
 * Expected Result:
 * - Old: 1 pack @ $10 = $10 prepaid (100 included covers first 100)
 * - New: 2 packs @ $10 = $20 prepaid (no included)
 * - Prepaid diff: $20 - $10 = +$10
 * - Base diff: $50 - $20 = $30
 * - Total: $40
 * - Balance = 200 (0 included + 200 purchased)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-prepaid 9: prepaid included decrease")}`, async () => {
	const customerId = "imm-switch-prepaid-included-dec";

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

	// Verify initial balance: 100 included + 100 purchased (1 pack) = 200
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: 2 packs ($20) - 1 pack ($10) = +$10
	// Total: $40
	expect(preview.total).toBe(40);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify messages: 0 included + 200 purchased (2 packs) = 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});
