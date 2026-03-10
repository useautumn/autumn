/**
 * Attach One-Off Prepaid with Tiered Pricing (Attach V2)
 *
 * Tests for attaching one-off products with included usage and tiered pricing
 * via the direct attach flow (customer already has payment method).
 *
 * Test 1: Customer-level attach with tiered one-off
 *   - Included usage: 100 units (1 free pack)
 *   - Tiered pricing: 0-500 @ $10/pack, 501+ @ $5/pack
 *   - Request 800 units → 1 free + 5×$10 + 2×$5 = $60 prepaid
 *   - Total: $10 base + $60 prepaid = $70
 *
 * Test 2: Entity-level attach with tiered one-off
 *   - Same tiered pricing, attached to two entities with different quantities
 *   - Entity 1: 300 units → 1 free + 2×$10 = $20 prepaid
 *   - Entity 2: 800 units → 1 free + 5×$10 + 2×$5 = $60 prepaid
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const INCLUDED_USAGE = 100;
const BASE_PRICE = 10;
const TIERS = [
	{ to: 500 as const, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer-level one-off with tiered pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("oneoff-prepaid-tiers: customer-level tiered one-off")}`, async () => {
	const customerId = "oneoff-tiers-customer";
	const quantity = 800;

	// 800 total = 8 packs: 1 free (includedUsage) + 7 paid
	// Tier 1 (0-500): 5 paid packs × $10 = $50
	// Tier 2 (501+): 2 paid packs × $5 = $10
	// Prepaid total: $60
	const expectedPrepaidCost = 5 * 10 + 2 * 5;
	const expectedTotal = BASE_PRICE + expectedPrepaidCost;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const oneOff = products.oneOff({
		id: "one-off-tiered-cus",
		items: [tieredOneOffItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: oneOff.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity-level one-off with tiered pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("oneoff-prepaid-tiers: entity-level tiered one-off")}`, async () => {
	const customerId = "oneoff-tiers-entity";
	const quantity1 = 300;
	const quantity2 = 800;

	// Entity 1: 300 total = 3 packs: 1 free + 2 paid
	// All 2 paid packs in tier 1 (0-500): 2 × $10 = $20
	const expectedPrepaidCost1 = 2 * 10;
	const expectedTotal1 = BASE_PRICE + expectedPrepaidCost1;

	// Entity 2: 800 total = 8 packs: 1 free + 7 paid
	// Tier 1 (0-500): 5 paid packs × $10 = $50
	// Tier 2 (501+): 2 paid packs × $5 = $10
	const expectedPrepaidCost2 = 5 * 10 + 2 * 5;
	const expectedTotal2 = BASE_PRICE + expectedPrepaidCost2;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const oneOff = products.oneOff({
		id: "one-off-tiered-ent",
		items: [tieredOneOffItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Attach to entity 1
	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
	});
	expect(preview1.total).toBe(expectedTotal1);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	});

	// Attach to entity 2
	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
	});
	expect(preview2.total).toBe(expectedTotal2);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
		redirect_mode: "if_required",
	});

	// Verify entity 1 balance
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: oneOff.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity1,
		usage: 0,
	});

	// Verify entity 2 balance
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: oneOff.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity2,
		usage: 0,
	});

	// Verify invoices: 2 total (one per entity attach)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: expectedTotal1,
	});
});
