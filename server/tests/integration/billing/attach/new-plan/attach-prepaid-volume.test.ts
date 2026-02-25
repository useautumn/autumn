/**
 * Attach Prepaid Volume Pricing Tests
 *
 * Verifies that volume-based tier pricing charges the entire purchased quantity
 * at the rate of whichever single tier it falls into — not split across tiers
 * the way graduated pricing works.
 *
 * Tiers used throughout (billingUnits = 100):
 *   Tier 1:  0–500 units  @ $10/pack (100 units/pack)
 *   Tier 2:  501+ units   @ $5/pack
 *
 * Volume pricing examples vs graduated:
 *   300 units (tier 1): volume = 3 packs × $10 = $30
 *                       graduated would also be $30 (all within tier 1)
 *   800 units (tier 2): volume = 8 packs × $5 = $40
 *                       graduated would be 5×$10 + 3×$5 = $65 (different!)
 *
 * Plan switch tests (immediate + scheduled) are in:
 *   attach-prepaid-volume-switch.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const BASE_PRICE = 20; // pro product base price

// Tiers (in Autumn units, i.e. packs of 100):
//   0–500 units @ $10/pack → Stripe tier boundary: 500/100 = 5
//   501+ units  @ $5/pack
const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Quantity within tier 1 — volume and graduated produce the same result
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 300 units = 3 packs, all within tier 1.
 * Volume: 3 × $10 = $30.
 * Graduated would also be $30 here (same tier).
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: 300 units, tier 1 only → $30")}`, async () => {
	const customerId = "attach-prepaid-volume-tier1";
	const quantity = 300;
	const expectedPrepaidCost = (quantity / BILLING_UNITS) * 10; // 3 × $10 = $30

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-tier1",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Preview must reflect volume pricing
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Quantity crossing into tier 2 — volume differs from graduated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 800 units = 8 packs, falling into tier 2.
 * Volume:    entire 8 packs × $5 = $40.
 * Graduated: 5 packs×$10 + 3 packs×$5 = $65.
 *
 * This test confirms volume semantics are applied end-to-end, not graduated.
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: 800 units, tier 2 → $40 (not $65 graduated)")}`, async () => {
	const customerId = "attach-prepaid-volume-tier2";
	const quantity = 800;
	// Volume: 8 packs × $5 = $40
	const expectedPrepaidCost = (quantity / BILLING_UNITS) * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-tier2",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Preview must reflect volume pricing ($40), not graduated ($65)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Quantity with included (free) usage in tier 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 300 total units, 100 free (1 pack included).
 * Purchased above free: 200 units = 2 packs, both in tier 1.
 * Volume: 2 × $10 = $20.
 * Balance: 300.
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: 300 units, 100 included, tier 1 → $20")}`, async () => {
	const customerId = "attach-prepaid-volume-included-tier1";
	const quantity = 300;
	const includedUsage = 100;
	// After free pack: 200 units = 2 packs in tier 1 → 2 × $10 = $20
	const expectedPrepaidCost = ((quantity - includedUsage) / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-included-tier1",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Zero quantity — no prepaid charge, only base price
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: quantity 0 → no prepaid charge")}`, async () => {
	const customerId = "attach-prepaid-volume-zero";

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-zero",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(BASE_PRICE);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: 4 tiers with included usage — volume pricing at correct tier
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 4 tiers (billingUnits = 100):
 *   Tier 1:  0-200 units    @ $15/pack
 *   Tier 2:  201-500 units  @ $10/pack
 *   Tier 3:  501-1000 units @ $7/pack
 *   Tier 4:  1001+ units    @ $5/pack
 *
 * With 100 included (free) and 900 total quantity:
 *   Paid packs: (900 - 100) / 100 = 8 packs
 *   Volume: all 8 packs at tier 3 rate ($7) = $56
 *   Total: $20 base + $56 = $76
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: 4 tiers, 100 included, 900 total → $76")}`, async () => {
	const customerId = "attach-prepaid-volume-4tier-incl";
	const quantity = 900;
	const includedUsage = 100;

	// 4-tier pricing structure
	const fourTiers = [
		{ to: 200, amount: 15 },
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 7 },
		{ to: "inf" as const, amount: 5 },
	];

	// Paid packs after free: (900 - 100) / 100 = 8 packs
	// 8 packs falls into tier 3 (800 paid units = 501-1000 range)
	// Volume pricing: all 8 packs at $7 = $56
	const expectedPrepaidCost = 8 * 7;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: fourTiers,
	});

	const pro = products.pro({
		id: "pro-volume-4tier",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Preview must reflect volume pricing at tier 3
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// Balance should equal total quantity (free + paid)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
