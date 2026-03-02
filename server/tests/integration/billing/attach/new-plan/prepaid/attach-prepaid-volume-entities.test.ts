/**
 * Attach Prepaid Volume vs Graduated — Entity-Level Initial Attach Test
 *
 * Test 1: Two entities, one graduated, one volume, same tier structure.
 *   800 units, tier 2:
 *     Graduated: 5×$10 + 3×$5 = $65
 *     Volume:    8×$5          = $40
 *
 * Test 2: Volume prepaid with includedUsage — verifies that the included
 *   usage acts as a free tier and the remaining purchased units are ALL
 *   charged at the volume rate (the tier that the purchased quantity falls into).
 *
 * Tiers (billingUnits = 100):
 *   Tier 1:  0–500 units  @ $10/pack
 *   Tier 2:  501+ units   @ $5/pack
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
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
// TEST: Entity 1 (graduated) and Entity 2 (volume) — initial attach at 800 units
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 800 units crosses into tier 2.
 *
 * Entity 1 (graduated): 5×$10 + 3×$5 = $65 → invoice = $20 + $65 = $85
 * Entity 2 (volume):    8×$5           = $40 → invoice = $20 + $40 = $60
 *
 * Confirms both pricing models are applied independently per entity.
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated ($65) vs volume ($40) at 800 units tier 2")}`, async () => {
	const customerId = "vol-ent-initial-800";
	const quantity = 800;

	// Graduated: 5×$10 + 3×$5 = $65
	const gradExpectedPrepaid = 5 * 10 + 3 * 5;
	// Volume: 8×$5 = $40
	const volExpectedPrepaid = (quantity / BILLING_UNITS) * 5;

	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const gradPro = products.pro({ id: "grad-pro-ent-800", items: [gradItem] });
	const volPro = products.pro({ id: "vol-pro-ent-800", items: [volItem] });

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, volPro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// ── Preview entity 1 (graduated): $20 + $65 = $85 ──
	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	// ── Preview entity 2 (volume): $20 + $40 = $60 ──
	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	// ── Attach both ──
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	// ── Assert entity 1 (graduated) ──
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: gradPro.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// ── Assert entity 2 (volume) ──
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// ── Customer invoices: 2 total, latest is the volume attach ($60) ──
	// Invoice 0 (latest): entity 2 volume — $60
	// Invoice 1:          entity 1 graduated — $85
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Volume prepaid with includedUsage — all purchased units at volume rate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Volume prepaid with includedUsage = 200 (must be multiple of billingUnits=100).
 *
 * Entity 1: quantity 800 → 200 included free, 600 purchased
 *   Purchased packs = 600/100 = 6 packs → falls in tier 2 (>5 packs)
 *   Volume: ALL 6 packs at tier-2 rate = 6×$5 = $30
 *   Invoice = $20 base + $30 = $50
 *
 * Entity 2: quantity 400 → 200 included free, 200 purchased
 *   Purchased packs = 200/100 = 2 packs → falls in tier 1 (≤5 packs)
 *   Volume: ALL 2 packs at tier-1 rate = 2×$10 = $20
 *   Invoice = $20 base + $20 = $40
 *
 * Confirms includedUsage is subtracted before volume pricing is applied,
 * and that volume pricing charges ALL purchased units at the single tier rate.
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: volume with includedUsage (200 free, tier pricing on rest)")}`, async () => {
	const customerId = "vol-ent-included-200";
	const includedUsage = 200;
	const quantity1 = 800;
	const quantity2 = 400;

	// Entity 1: 800 (including included usage) purchased
	const purchasedPacks1 = quantity1 / BILLING_UNITS;
	const volExpected1 = purchasedPacks1 * 5; // tier 2 rate (>5 packs)

	// Entity 2: 400 (including included usage) purchased
	const purchasedPacks2 = quantity2 / BILLING_UNITS;
	const volExpected2 = purchasedPacks2 * 10; // tier 1 rate (≤5 packs)

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({ id: "vol-pro-inc-200", items: [volItem] });

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// ── Preview entity 1: $20 base + $30 volume = $50 ──
	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
	});
	expect(preview1.total).toBe(BASE_PRICE + volExpected1);

	// ── Preview entity 2: $20 base + $20 volume = $40 ──
	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
	});
	expect(preview2.total).toBe(BASE_PRICE + volExpected2);

	// ── Attach both ──
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
		redirect_mode: "if_required",
	});

	// ── Assert entity 1: balance = 800 ──
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity1,
		usage: 0,
	});

	// ── Assert entity 2: balance = 400 ──
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity2,
		usage: 0,
	});

	// ── Customer invoices: 2 total ──
	// Invoice 0 (latest): entity 2 — $40
	// Invoice 1:          entity 1 — $50
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + volExpected2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpected1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
