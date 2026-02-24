import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Volume Pricing — Update Quantity Tests
 *
 * Verifies that `subscriptions.update` charges the correct delta when quantity changes
 * under VOLUME pricing (entire quantity billed at the rate of its tier).
 *
 * Tier setup (billingUnits = 100):
 *   Tier 1: 0–500 units  → $10 / pack  →  volumeCost(n) = (n/100) × $10
 *   Tier 2: 501+ units   → $5  / pack  →  volumeCost(n) = (n/100) × $5
 *
 * Cost table used throughout:
 *   300 units → tier 1 → 3 × $10 = $30
 *   500 units → tier 1 → 5 × $10 = $50
 *   600 units → tier 2 → 6 × $5  = $30
 *   800 units → tier 2 → 8 × $5  = $40
 *  1000 units → tier 2 → 10 × $5 = $50
 *
 * Volume vs Graduated delta comparison (the KEY tests are 2 and 5):
 *   Test 1: 300→500  same tier   volume +$20  graduated +$20  (no diff)
 *   Test 2: 300→800  tier 1→2   volume +$10  graduated +$35  ← DIFFERENTIATOR
 *   Test 3: 600→1000 same tier   volume +$20  graduated +$20  (no diff)
 *   Test 4: 500→300  same tier   volume −$20  graduated −$20  (no diff)
 *   Test 5: 800→300  tier 2→1   volume −$10  graduated −$35  ← DIFFERENTIATOR
 */

const BILLING_UNITS = 100;

const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ─── Test 1: Increase — same tier (300 → 500, both tier 1) ───────────────────

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase same tier 300→500")}`, async () => {
	const customerId = "volume-update-qty-increase-t1";
	const initQuantity = 300;
	const newQuantity = 500;

	// Old cost: 3 × $10 = $30. New cost: 5 × $10 = $50. Delta: +$20.
	// Graduated delta: same (+$20) — no difference within same tier.
	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 10; // $20

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t1",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview update
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	// Execute update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

// ─── Test 2: Increase — crosses tier boundary (300 → 800, tier 1 → tier 2) ──

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase crossing tier 300→800")}`, async () => {
	const customerId = "volume-update-qty-increase-t2";
	const initQuantity = 300;
	const newQuantity = 800;

	// Volume: old cost = 3 × $10 = $30. New cost = 8 × $5 = $40. Delta: +$10.
	// Graduated would charge: 5×$10 + 3×$5 = $65 for new; delta = $65 − $30 = +$35. KEY DIFF.
	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 5 - (initQuantity / BILLING_UNITS) * 10; // $40 − $30 = $10

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t2",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview update
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	// Volume charges $10; graduated would charge $35 — assert the volume amount
	expect(preview.total).toBe(expectedDelta);

	// Execute update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

// ─── Test 3: Increase — within tier 2 already (600 → 1000) ──────────────────

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: increase same tier 600→1000")}`, async () => {
	const customerId = "volume-update-qty-increase-t3";
	const initQuantity = 600;
	const newQuantity = 1000;

	// Old cost: 6 × $5 = $30. New cost: 10 × $5 = $50. Delta: +$20.
	// Graduated delta: same (+$20) — no difference within same tier.
	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 5 - (initQuantity / BILLING_UNITS) * 5; // $50 − $30 = $20

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-inc-t3",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview update
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	// Execute update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

// ─── Test 4: Decrease — same tier (500 → 300, both tier 1) ──────────────────

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: decrease same tier 500→300")}`, async () => {
	const customerId = "volume-update-qty-decrease-t1";
	const initQuantity = 500;
	const newQuantity = 300;

	// Old cost: 5 × $10 = $50. New cost: 3 × $10 = $30. Delta: −$20.
	// Graduated delta: same (−$20) — no difference within same tier.
	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 10; // $30 − $50 = −$20

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-dec-t1",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview downgrade
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(expectedDelta);

	// Execute downgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});

// ─── Test 5: Decrease — crosses tier boundary (800 → 300, tier 2 → tier 1) ──

test.concurrent(`${chalk.yellowBright("volume-tiers-update-quantity: decrease crossing tier 800→300")}`, async () => {
	const customerId = "volume-update-qty-decrease-t2";
	const initQuantity = 800;
	const newQuantity = 300;

	// Volume: old cost = 8 × $5 = $40. New cost = 3 × $10 = $30. Delta: −$10.
	// Graduated old cost: 5×$10 + 3×$5 = $65. New: 3×$10 = $30. Graduated delta = −$35. KEY DIFF.
	const expectedDelta =
		(newQuantity / BILLING_UNITS) * 10 - (initQuantity / BILLING_UNITS) * 5; // $30 − $40 = −$10

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "vol-upd-qty-dec-t2",
		items: [volumeItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview downgrade
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	// Volume credits $10; graduated would credit $35 — assert the volume amount
	expect(preview.total).toBe(expectedDelta);

	// Execute downgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(newQuantity);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedDelta,
	});
});
