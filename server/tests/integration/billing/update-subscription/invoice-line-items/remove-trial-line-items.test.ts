/**
 * Update Trial Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when updating/removing trials via the billing v2 flow.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Remove trial on multi-entity product - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create Pro with trial ($20/mo per entity, 14-day trial) with all feature types
 * - Create 2 entities, attach Pro trial to EACH entity
 * - Remove trial on one entity by calling subscriptions.update({ free_trial: null })
 *
 * Expected Result:
 * - Removing trial generates an invoice
 * - Invoice line items are persisted to DB
 * - Line items include base price charge, prepaid charges, allocated charges
 * - prorated: false (trial removal = start fresh billing)
 */
test.concurrent(`${chalk.yellowBright("update-trial-line-items 1: remove trial multi-entity with all feature types - line items persisted")}`, async () => {
	const customerId = "trial-li-remove-multi-entity";

	// Pro product with trial and all feature types
	const freeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });

	const basePrice = 20;
	const prepaidPrice = 10; // 1 pack × $10
	// When trial is removed, ALL entities on the subscription get charged
	// 2 entities × ($20 base + $10 prepaid) = $60
	const expectedTotal = 2 * (basePrice + prepaidPrice); // $60

	const proTrial = products.proWithTrial({
		id: "pro-trial-multi-entity",
		items: [freeMessages, prepaidMessages, consumableWords],
		trialDays: 14,
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro trial to both entities with prepaid quantity
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify both entities are trialing (should have $0 invoices for trials)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 0,
	});

	// Remove trial on entity 0 - this should generate a paid invoice
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		free_trial: null, // Remove trial
	});

	// Verify invoice was created for entity 1's charges
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now have 3 invoices: 2 trial ($0) + 1 paid invoice
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
		latestTotal: 60,
	});

	await timeout(3000);

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Base price ($40 for 2 entities × $20, prorated because mid-period)
			{ isBasePrice: true, amount: basePrice * 2, prorated: true },
			// Prepaid messages - each entity has its own inline price line item
			// 2 line items × $10 each = $20 total
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice * 2,
				billingTiming: "in_advance",
				count: 2,
			},
		],
	});
});
