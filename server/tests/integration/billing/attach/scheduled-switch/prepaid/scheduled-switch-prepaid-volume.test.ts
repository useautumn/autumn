/**
 * Attach Prepaid Volume Pricing — Scheduled Switch Tests (Downgrade: premium → pro)
 *
 * Downgrading to a lower base price is scheduled. preview.total === 0 always.
 * Old product becomes "canceling" (active + canceled_at set), new product is "scheduled".
 * After the billing cycle advances the new product becomes active with a fresh invoice.
 *
 * Each scenario has two test.concurrent calls:
 *   ...-mid        — asserts mid-cycle state (canceling + scheduled)
 *   ...-after-cycle — advances clock and asserts post-cycle state
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
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRO_BASE_PRICE = 20;

// Tiers (in Autumn units, i.e. packs of 100):
//   0–500 units @ $10/pack → Stripe tier boundary: 500/100 = 5
//   501+ units  @ $5/pack
const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Scheduled switch, 300 units, tier 1 → tier 1 (same quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * premium ($50/mo) + 300 units → tier 1 → 3 packs × $10 = $30
 * Downgrade: pro ($20/mo) + 300 units
 *
 * Scheduled: premium stays active (canceling) until cycle ends.
 * preview.total === 0 always for downgrades.
 */

// --- Mid-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 300 units tier 1 → tier 1")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t1";
	const initQuantity = 300;
	const newQuantity = 300;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t1",
		items: [proItem],
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
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// Preview for downgrade is always $0
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	// Old plan still active — balance reflects original quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	// No new invoice charged for a downgrade
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// --- After-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 300 units tier 1 → tier 1 (pro $20 + $30)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t1";
	const initQuantity = 300;
	const newQuantity = 300;
	// Volume: 3 packs × $10 = $30 (all tier 1)
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 10;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	// New invoice: pro base $20 + 3 × $10 = $50
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Scheduled switch, 800 → 300 units, tier 2 → tier 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * premium ($50/mo) + 800 units → tier 2 → 8 packs × $5 = $40
 * Downgrade: pro ($20/mo) + 300 units
 *
 * After cycle: pro base $20 + 300 units tier 1 (3 × $10 = $30) = $50.
 * Volume vs graduated: same here (300 units all in tier 1 — no difference).
 */

// --- Mid-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 800 → 300 units tier 2 → tier 1")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t2-t1";
	const initQuantity = 800;
	const newQuantity = 300;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t2-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t2-t1",
		items: [proItem],
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
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	// Old plan still active — balance reflects original (800) quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// --- After-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 800 → 300 units tier 2 → tier 1 (pro $20 + $30)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t2-t1";
	const initQuantity = 800;
	const newQuantity = 300;
	// Volume: 3 packs × $10 = $30 (all tier 1; graduated same here)
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 10;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t2-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t2-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	// New invoice: pro base $20 + 3 × $10 = $50
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Scheduled switch, 1000 → 600 units, tier 2 → tier 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * premium ($50/mo) + 1000 units → tier 2 → 10 packs × $5 = $50
 * Downgrade: pro ($20/mo) + 600 units
 *
 * After cycle: pro base $20 + 600 units → tier 2 → 6 × $5 = $30 (volume!)
 *   Graduated would be: 5×$10 + 1×$5 = $55 — KEY DIFFERENTIATOR
 *   latestTotal: $20 + $30 = $50
 */

// --- Mid-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 1000 → 600 units tier 2 → tier 2")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t2-t2";
	const initQuantity = 1000;
	const newQuantity = 600;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t2-t2",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t2-t2",
		items: [proItem],
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
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	// Old plan still active — balance reflects original (1000) quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// --- After-cycle ---
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 1000 → 600 units tier 2 → tier 2 (pro $20 + $30 volume, not $55 graduated)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t2-t2";
	const initQuantity = 1000;
	const newQuantity = 600;
	// Volume: 6 packs × $5 = $30 (all at tier-2 rate)
	// Graduated would be: 5×$10 + 1×$5 = $55 — this confirms volume semantics
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 5;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t2-t2",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t2-t2",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	// New invoice: pro base $20 + 6 × $5 (volume) = $50
	// Graduated would be: $20 + 5×$10 + 1×$5 = $75 — confirms volume semantics
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
