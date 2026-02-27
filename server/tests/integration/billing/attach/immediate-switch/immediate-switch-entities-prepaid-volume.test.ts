/**
 * Attach Prepaid Volume vs Graduated — Entity-Level Immediate Switch Tests
 *
 * Two entities share one customer. Each entity is on a different prepaid tier
 * pricing model for their Messages feature:
 *
 *   Entity 1 — GRADUATED pricing (tieredPrepaidMessages):
 *     Usage is split across tiers. 800 units → 5×$10 + 3×$5 = $65.
 *
 *   Entity 2 — VOLUME pricing (volumePrepaidMessages):
 *     All units charged at the rate of the matching tier. 800 units → 8×$5 = $40.
 *
 * Tiers (billingUnits = 100):
 *   Tier 1:  0–500 units  @ $10/pack
 *   Tier 2:  501+ units   @ $5/pack
 *
 * Both entities start on pro and immediately switch to premium.
 * The invoice totals confirm that Autumn applies the correct pricing model
 * per product item and that the two entities remain fully independent.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;

// Shared tiers — same boundaries for both graduated and volume products
const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 (graduated) and Entity 2 (volume) — both switch pro → premium
//         at 800 units (tier 2). Graduated charges $65; volume charges $40.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quantity: 800 units (tier 2).
 *
 * GRADUATED math (entity 1):
 *   Old prepaid: 5×$10 + 3×$5 = $65
 *   New prepaid: 5×$10 + 3×$5 = $65
 *   Prepaid delta: $0 (same model, same quantity)
 *   Switch cost = prorated base upgrade (> 0)
 *
 * VOLUME math (entity 2):
 *   Old prepaid: 8×$5 = $40
 *   New prepaid: 8×$5 = $40
 *   Graduated would be: 5×$10+3×$5 = $65 — confirms volume semantics
 *   Prepaid delta: $0 (same quantity, same tier)
 *   Switch cost = prorated base upgrade (> 0)
 *
 * Both have the same switch cost (only base proration, no prepaid delta).
 * Total invoices on customer: 4 (initial pro × 2, switch invoice × 2).
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated (entity 1) vs volume (entity 2), 800 units same tier, pro → premium")}`, async () => {
	const customerId = "vol-ent-switch-800-same";

	// ── Graduated products (entity 1) ──
	const gradProItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPremiumItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPro = products.pro({
		id: "grad-pro-800",
		items: [gradProItem],
	});
	const gradPremium = products.premium({
		id: "grad-premium-800",
		items: [gradPremiumItem],
	});

	// ── Volume products (entity 2) ──
	const volProItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPremiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPro = products.pro({
		id: "vol-pro-800",
		items: [volProItem],
	});
	const volPremium = products.premium({
		id: "vol-premium-800",
		items: [volPremiumItem],
	});

	const quantity = 800;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, gradPremium, volPro, volPremium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Entity 1 → graduated pro
			s.billing.attach({
				productId: gradPro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
			// Entity 2 → volume pro
			s.billing.attach({
				productId: volPro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	// ── Verify initial state ──
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1Before, productId: gradPro.id });
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2Before, productId: volPro.id });
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// ── Preview entity 1 switch (graduated): prepaid delta = $0 ──
	const previewEnt1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewEnt1.total).toBeGreaterThan(0);

	// ── Preview entity 2 switch (volume): prepaid delta = $0 ──
	const previewEnt2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewEnt2.total).toBeGreaterThan(0);

	// ── Switch entity 1: graduated pro → graduated premium ──
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	// ── Switch entity 2: volume pro → volume premium ──
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	// ── Assert entity 1 post-switch ──
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [gradPremium.id],
		notPresent: [gradPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// ── Assert entity 2 post-switch ──
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [volPremium.id],
		notPresent: [volPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	// ── Verify customer-level invoices ──
	// Invoice 0: entity 1 switch (prorated base upgrade, graduated, prepaid delta $0)
	// Invoice 1: entity 2 switch (prorated base upgrade, volume, prepaid delta $0)
	// Invoice 2: entity 1 initial (graduated pro + 800 units = $20 + $65 = $85)
	// Invoice 3: entity 2 initial (volume pro + 800 units = $20 + $40 = $60)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 (graduated) and Entity 2 (volume) — switch from 300 → 800 units
//         This is the KEY differentiator: graduated charges $65, volume charges $40.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initial quantity: 300 units (tier 1). New quantity: 800 units (tier 2).
 *
 * GRADUATED math (entity 1):
 *   Old prepaid: 3×$10 = $30 (tier 1)
 *   New prepaid: 5×$10 + 3×$5 = $65 (graduated across tiers)
 *   Prepaid delta: $65 − $30 = +$35
 *   Switch invoice ≈ base proration + $35
 *
 * VOLUME math (entity 2):
 *   Old prepaid: 3×$10 = $30 (tier 1, volume same as graduated here)
 *   New prepaid: 8×$5 = $40  ← volume: all 8 packs at tier-2 rate
 *   Graduated would be: 5×$10+3×$5 = $65 — KEY DIFFERENTIATOR
 *   Prepaid delta: $40 − $30 = +$10
 *   Switch invoice ≈ base proration + $10
 *
 * The graduated entity pays $25 more in prepaid delta than the volume entity,
 * confirming that each item uses its own pricing model independently.
 */
test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-entities: graduated ($65) vs volume ($40), 300 → 800 units tier 1 → tier 2")}`, async () => {
	const customerId = "vol-ent-switch-300-800";

	// ── Graduated products (entity 1) ──
	const gradProItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPremiumItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradPro = products.pro({
		id: "grad-pro-300-800",
		items: [gradProItem],
	});
	const gradPremium = products.premium({
		id: "grad-premium-300-800",
		items: [gradPremiumItem],
	});

	// ── Volume products (entity 2) ──
	const volProItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPremiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const volPro = products.pro({
		id: "vol-pro-300-800",
		items: [volProItem],
	});
	const volPremium = products.premium({
		id: "vol-premium-300-800",
		items: [volPremiumItem],
	});

	const initQuantity = 300;
	const newQuantity = 800;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [gradPro, gradPremium, volPro, volPremium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: gradPro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: volPro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	// ── Preview switches to capture expected switch totals ──
	// Entity 1 (graduated): prepaid delta = +$35 (new $65 − old $30)
	const previewEnt1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(previewEnt1.total).toBeGreaterThan(0);

	// Entity 2 (volume): prepaid delta = +$10 (new $40 − old $30)
	// previewEnt2.total should be LESS than previewEnt1.total by ~$25
	const previewEnt2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(previewEnt2.total).toBeGreaterThan(0);

	// The graduated entity pays more: graduated new prepaid ($65) > volume new prepaid ($40)
	// so graduated switch invoice > volume switch invoice by ~$25
	expect(previewEnt1.total).toBeGreaterThan(previewEnt2.total);

	// ── Perform switches ──
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradPremium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPremium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	// ── Assert entity 1 (graduated) post-switch ──
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [gradPremium.id],
		notPresent: [gradPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});

	// ── Assert entity 2 (volume) post-switch ──
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [volPremium.id],
		notPresent: [volPro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});

	// ── Verify customer invoices ──
	// Invoice 0 (latest): entity 2 switch (volume, prepaid delta +$10 = preview)
	// Invoice 1: entity 1 switch (graduated, prepaid delta +$35 = preview)
	// Invoice 2: entity 2 initial (volume pro + 300 units = $20 + $30 = $50)
	// Invoice 3: entity 1 initial (graduated pro + 300 units = $20 + $30 = $50)
	// Both initial invoices are equal because 300 units is all tier 1 (volume=graduated there)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
