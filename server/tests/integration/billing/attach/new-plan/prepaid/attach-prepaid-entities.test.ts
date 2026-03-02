/**
 * Attach Prepaid to Multiple Entities
 *
 * Test 1: Attaches a prepaid product with included usage to two separate entities.
 *   Each entity gets its own independent balance.
 *   Product: base (no base price) with prepaid messages (100 included, $10 per 100 extra)
 *   Entity 1: quantity 300 → 100 included + 200 purchased (2×$10 = $20)
 *   Entity 2: quantity 500 → 100 included + 400 purchased (4×$10 = $40)
 *
 * Test 2: Customer has the same prepaid product attached, then entities also attach it.
 *   Customer balance = customer's own + sum of entity balances.
 *   Entity balance = entity's own + customer's balance (inheritance).
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
const PRICE_PER_UNIT = 10;
const INCLUDED_USAGE = 100;

test.concurrent(`${chalk.yellowBright("prepaid-entities: attach prepaid messages with included usage to two entities")}`, async () => {
	const customerId = "prepaid-ent-two-included";
	const quantity1 = 300;
	const quantity2 = 500;

	const purchasedUnits1 = (quantity1 - INCLUDED_USAGE) / BILLING_UNITS;
	const purchasedUnits2 = (quantity2 - INCLUDED_USAGE) / BILLING_UNITS;
	const prepaidCost1 = purchasedUnits1 * PRICE_PER_UNIT;
	const prepaidCost2 = purchasedUnits2 * PRICE_PER_UNIT;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const base = products.base({
		id: "base-prepaid-ent-inc",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: base.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
			}),
			s.billing.attach({
				productId: base.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: quantity2 }],
			}),
		],
	});

	// Verify entity 1: product active, balance = 300
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: quantity1,
		usage: 0,
	});

	// Verify entity 2: product active, balance = 500
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: quantity2,
		usage: 0,
	});

	// Verify invoices: no base price, so totals are just prepaid costs
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: prepaidCost2,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: prepaidCost1,
	});

	// Verify Stripe subscription matches expected state
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Customer + Entity both have same prepaid product (balance inheritance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Customer attaches prepaid product at customer level (qty 200 → balance 200).
 * Then entity 1 attaches same product at entity level (qty 300 → balance 300).
 *
 * Expected:
 * - Customer total balance = 200 (own) + 300 (entity) = 500
 * - Entity 1 balance = 300 (own) + 200 (inherited from customer) = 500
 * - Invoices: 2 total (customer attach + entity attach)
 */
test.concurrent(`${chalk.yellowBright("prepaid-entities: customer + entity both have same prepaid product")}`, async () => {
	const customerId = "prepaid-ent-with-customer";
	const customerQuantity = 200;
	const entityQuantity = 300;

	const customerPurchasedUnits =
		(customerQuantity - INCLUDED_USAGE) / BILLING_UNITS;
	const entityPurchasedUnits =
		(entityQuantity - INCLUDED_USAGE) / BILLING_UNITS;
	const customerPrepaidCost = customerPurchasedUnits * PRICE_PER_UNIT;
	const entityPrepaidCost = entityPurchasedUnits * PRICE_PER_UNIT;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const base = products.base({
		id: "base-prepaid-cus-ent",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			// Customer-level attach first
			s.billing.attach({
				productId: base.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: customerQuantity },
				],
			}),
			// Then entity-level attach
			s.billing.attach({
				productId: base.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: entityQuantity },
				],
			}),
		],
	});

	// Verify entity 1: own balance (300) + inherited from customer (200) = 500
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: base.id });
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: entityQuantity + customerQuantity,
	});

	// Verify customer total: own (200) + entity (300) = 500
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(
		customerQuantity + entityQuantity,
	);

	// Invoices: 2 total — customer attach + entity attach
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: entityPrepaidCost,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: customerPrepaidCost,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
