/**
 * Volume Pricing Edge Case Tests
 *
 * Tests for the three most dangerous correctness gaps in volume pricing —
 * cases where a subtle bug in the implementation would produce a wrong number
 * silently rather than throwing an error.
 *
 * Tiers used throughout (billingUnits = 100):
 *   Tier 1:  0–500 units  @ $10/pack
 *   Tier 2:  501+ units   @ $5/pack
 *
 * Tests A–C attach both a volume and a graduated product to the same customer.
 * To allow both to coexist (they must not replace each other), the volume
 * product uses products.pro() and the graduated product uses products.base()
 * with an explicit monthly price — different plan types, no mutual exclusion.
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
const BASE_PRICE = 20;
const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Exact tier boundary — 500 units
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The boundary check in volumeTiersToLineAmount is `roundedUsage <= tierBoundary`
 * (inclusive upper bound). Exactly 500 units with `{ to: 500 }` must stay in
 * tier 1, not spill into tier 2.
 *
 * Volume:    500 → tier 1 (500 ≤ 500) → 5 × $10 = $50
 * Graduated: 500 → tier 1 (min(500,500)=500) → 5 × $10 = $50  (same)
 *
 * A regression of `<=` → `<` would bump volume to tier 2: 5 × $5 = $25.
 * Both models must agree on $50 here — the agreement is the assertion.
 */
test.concurrent(`${chalk.yellowBright("vol-edge: 500 units (exact tier 1 boundary) → $50, volume = graduated")}`, async () => {
	const customerId = "vol-edge-boundary-500";
	const quantity = 500;
	// Both: 5 packs × $10 = $50
	const expectedPrepaid = (quantity / BILLING_UNITS) * 10;

	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	// Distinct groups so the two products don't mutually-exclude each other
	const volPro = products.pro({ id: "vol-pro-500", items: [volItem], group: "vol-500" });
	const gradBase = products.base({
		id: "grad-base-500",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-500",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	// Both previews must be $70 — volume bumped to tier 2 would return $45
	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + expectedPrepaid);

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + expectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	// 2 invoices, both $70
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Non-pack-aligned quantity — ceiling rounding (501 units)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The implementation rounds usage up before tier lookup:
 * ceil(501 / 100) * 100 = 600. Volume applies tier 2 to 600 units.
 *
 * Volume:    501 → ceil → 600 → tier 2 → 6 × $5  = $30  → invoice $50
 * Graduated: 501 → ceil → 600 → split  → 500×($10/100) + 100×($5/100)
 *                                       = $50 + $5 = $55 → invoice $75
 *
 * The balance is 600 (the ceiling-rounded value), not 501.
 */
test.concurrent(`${chalk.yellowBright("vol-edge: 501 units (ceil to 600) → volume $30, graduated $55, balance 600")}`, async () => {
	const customerId = "vol-edge-ceiling-501";
	const quantity = 501;
	const ceiledQuantity = 600; // ceil(501/100)*100

	// Volume: 6 packs × $5 = $30
	const volExpectedPrepaid = (ceiledQuantity / BILLING_UNITS) * 5;
	// Graduated: 500 units at $10/100 + 100 units at $5/100 = $50 + $5 = $55
	const gradExpectedPrepaid =
		500 * (10 / BILLING_UNITS) + 100 * (5 / BILLING_UNITS);

	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	// Distinct groups so the two products don't mutually-exclude each other
	const volPro = products.pro({ id: "vol-pro-501", items: [volItem], group: "vol-501" });
	const gradBase = products.base({
		id: "grad-base-501",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-501",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	// Both products contribute 600 units (ceiling-rounded) each
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: ceiledQuantity * 2,
		usage: 0,
	});

	// Invoice 0 (latest): graduated — $75
	// Invoice 1:          volume    — $50
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: includedUsage + volume, purchased quantity crosses tier boundary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Volume pricing applies to PURCHASED units only (total − includedUsage).
 * featureOptionsToV2StripeQuantity sends only purchased packs to Stripe for
 * volume prices — no free leading tier is inserted in the Stripe price object.
 *
 * includedUsage=200, quantity=800 → purchased = 600 units (6 packs), tier 2
 *
 * Volume:    600 purchased → tier 2 → 6 × $5  = $30  → invoice $50
 * Graduated: 600 purchased → split  → 500×($10/100) + 100×($5/100)
 *                                    = $50 + $5 = $55 → invoice $75
 *
 * A bug that sent 8 total packs (not 6 purchased) to Stripe for volume would
 * charge 8 × $5 = $40 instead of $30. The $50 preview assertion catches this.
 */
test.concurrent(`${chalk.yellowBright("vol-edge: includedUsage=200, qty=800 → volume 6 purchased packs $30 (not 8 packs $40), graduated $55")}`, async () => {
	const customerId = "vol-edge-included-800";
	const quantity = 800;
	const includedUsage = 200;
	// Purchased = 800 - 200 = 600 units, all in tier 2
	const purchasedUnits = quantity - includedUsage;

	// Volume: 6 packs × $5 = $30
	const volExpectedPrepaid = (purchasedUnits / BILLING_UNITS) * 5;
	// Graduated: 500×($10/100) + 100×($5/100) = $50 + $5 = $55
	const gradExpectedPrepaid =
		500 * (10 / BILLING_UNITS) + 100 * (5 / BILLING_UNITS);

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	// Distinct groups so the two products don't mutually-exclude each other
	const volPro = products.pro({ id: "vol-pro-inc", items: [volItem], group: "vol-inc" });
	const gradBase = products.base({
		id: "grad-base-inc",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-inc",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	// Volume: $20 + $30 = $50 (wrong impl sending 8 packs would give $60)
	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	// Graduated: $20 + $55 = $75
	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	// Both products contribute 800 units each
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity * 2,
		usage: 0,
	});

	// Invoice 0 (latest): graduated — $75
	// Invoice 1:          volume    — $50
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST D: includedUsage fully covers the requested quantity (0 purchased packs)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * includedUsage=500 (5 free packs), user requests 300 units.
 * Purchased packs = 0. featureOptionsToV2StripeQuantity returns 0 for volume.
 *
 * Volume: 0 purchased packs → $0 prepaid → only base price charged.
 *
 * The balance is the full includedUsage (500), not the requested quantity (300),
 * because the product grants 500 free units regardless of what the user asked for.
 *
 * Guards against: negative purchased quantity errors, off-by-one that charges
 * 1 pack instead of 0, or the zero-quantity path throwing in Stripe price creation.
 */
test.concurrent(`${chalk.yellowBright("vol-edge: includedUsage=500 covers qty=300 → 0 purchased packs, $0 prepaid, balance=500")}`, async () => {
	const customerId = "vol-edge-included-all";
	const quantity = 300;
	const includedUsage = 500;

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({ id: "vol-pro-inc-all", items: [volItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro] }),
		],
		actions: [],
	});

	// Preview must be base-only — allowance covers all requested units
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });

	// Balance is the full includedUsage (500), not the requested 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
