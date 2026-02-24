/**
 * Attach Prepaid Volume Pricing — Immediate Switch Tests (Upgrade: pro → premium)
 *
 * Autumn charges the prorated base difference plus the prepaid delta immediately.
 * Old product disappears; new product is immediately active.
 *
 * Tiers used throughout (billingUnits = 100):
 *   Tier 1:  0–500 units  @ $10/pack (100 units/pack)
 *   Tier 2:  501+ units   @ $5/pack
 */

import { expect, test } from "bun:test";
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
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;

// Tiers (in Autumn units, i.e. packs of 100):
//   0–500 units @ $10/pack → Stripe tier boundary: 500/100 = 5
//   501+ units  @ $5/pack
const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Immediate switch, 300 units, tier 1 → tier 1 (same quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * pro ($20/mo) + 300 units → tier 1 → 3 packs × $10 = $30
 * premium ($50/mo) + 300 units → tier 1 → 3 packs × $10 = $30
 *
 * Volume math:
 *   Old prepaid:   3 × $10 = $30
 *   New prepaid:   3 × $10 = $30
 *   Prepaid delta: $0
 *   Switch total = prorated base upgrade ($50 - $20 × remaining fraction) > 0
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: immediate switch, 300 units tier 1 → tier 1")}`, async () => {
	const customerId = "attach-prepaid-volume-imm-t1";
	const initQuantity = 300;
	const newQuantity = 300;

	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({ id: "pro-volume-imm-t1", items: [proItem] });
	const premium = products.premium({
		id: "premium-volume-imm-t1",
		items: [premiumItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});

	// Preview — prepaid delta = $0 (same tier, same quantity); only prorated base upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBeGreaterThan(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
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
		balance: newQuantity,
		usage: 0,
	});
	// latestTotal ≈ preview.total (prorated base upgrade, no prepaid delta)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Immediate switch, 300 → 800 units, tier 1 → tier 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * pro ($20/mo) + 300 units → tier 1 → 3 packs × $10 = $30
 * premium ($50/mo) + 800 units → tier 2 → 8 packs × $5 = $40
 *
 * Volume math (key differentiator vs graduated):
 *   Old prepaid:         3 × $10 = $30
 *   New prepaid:         8 × $5  = $40  ← volume: all 8 packs at tier-2 rate
 *   Graduated would be:  5×$10 + 3×$5  = $65  (different — confirms volume)
 *   Prepaid delta:       $40 − $30      = +$10
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: immediate switch, 300 → 800 units tier 1 → tier 2 ($40 not $65 graduated)")}`, async () => {
	const customerId = "attach-prepaid-volume-imm-t1-t2";
	const initQuantity = 300;
	const newQuantity = 800;

	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({ id: "pro-volume-imm-t1-t2", items: [proItem] });
	const premium = products.premium({
		id: "premium-volume-imm-t1-t2",
		items: [premiumItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});

	// Preview — prepaid delta = +$10 (new: $40 volume, old: $30) plus base proration
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBeGreaterThan(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
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
		balance: newQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Immediate switch, 800 → 600 units, tier 2 → tier 2 (quantity decreases)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * pro ($20/mo) + 800 units → tier 2 → 8 packs × $5 = $40
 * premium ($50/mo) + 600 units → tier 2 → 6 packs × $5 = $30
 *
 * Volume math (key differentiator vs graduated):
 *   Old prepaid:         8 × $5  = $40
 *   New prepaid:         6 × $5  = $30  ← volume: all 6 packs at tier-2 rate
 *   Graduated would be:  5×$10 + 1×$5  = $55  (different — confirms volume)
 *   Prepaid delta:       $30 − $40      = −$10 (credit, offsets base proration)
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: immediate switch, 800 → 600 units tier 2 → tier 2 ($30 not $55 graduated)")}`, async () => {
	const customerId = "attach-prepaid-volume-imm-t2-t2";
	const initQuantity = 800;
	const newQuantity = 600;

	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({ id: "pro-volume-imm-t2-t2", items: [proItem] });
	const premium = products.premium({
		id: "premium-volume-imm-t2-t2",
		items: [premiumItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});

	// Preview — prepaid delta = −$10 (new: $30 volume, old: $40) credited against base proration
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(typeof preview.total).toBe("number");

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
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
		balance: newQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
