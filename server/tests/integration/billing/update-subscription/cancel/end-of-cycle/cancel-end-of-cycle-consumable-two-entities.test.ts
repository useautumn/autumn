/**
 * Cancel End of Cycle Consumable Tests: canceling products with consumable/arrear items at end of
 * cycle; overage usage is billed in the final invoice when the cycle ends naturally.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Two entities, both overage, cancel end of cycle → advance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel both end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Both entities' overage billed in final invoices
 * - Both products removed after cycle ends
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: two entities, both overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-2ent";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Verify pro is active on both entities
		const entity1 = await autumnV1.entities.get(customerId, entity1Id);
		const entity2 = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductActive({ customer: entity1, productId: pro.id });
		await expectProductActive({ customer: entity2, productId: pro.id });

		// Verify initial invoices: 2 invoices, $20 each for entity attaches
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		// Track usage on entity 1: 300 messages (200 overage = $20)
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity1Id,
			feature_id: TestFeature.Messages,
			value: 300,
		});

		// Track usage on entity 2: 600 messages (500 overage = $50)
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity2Id,
			feature_id: TestFeature.Messages,
			value: 600,
		});

		// Cancel both entities end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify both are canceling
		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entity2AfterCancel,
			productId: pro.id,
		});

		// Advance to next invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 70,
				}),
		});

		// Verify both products removed
		const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
		const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductNotPresent({
			customer: entity1Final,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity2Final,
			productId: pro.id,
		});

		// Calculate expected overage amounts
		// Entity 1: 300 messages - 100 included = 200 overage * $0.10 = $20
		// Entity 2: 600 messages - 100 included = 500 overage * $0.10 = $50
		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 300 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const entity2Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 600 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(entity1Overage).toBe(20);
		expect(entity2Overage).toBe(50);

		const totalOverage = entity1Overage + entity2Overage;
		expect(totalOverage).toBe(70);

		// Check customer invoices
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should have 3 invoices:
		// - 2 initial invoices ($20 each for entity attaches)
		// - 1 final invoice ($70 for combined overage from both entities)
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: totalOverage,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Two entities, cancel one end of cycle, keep one active
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel only Entity 1 end of cycle
 * - Keep Entity 2 active
 * - Advance to next invoice
 *
 * Expected Result:
 * - Entity 1's overage billed, product removed
 * - Entity 2 continues with subscription, renews normally
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: two entities, cancel one, keep one active")}`,
	async () => {
		const customerId = "cancel-eoc-cons-2ent-1cancel";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Verify initial invoices: 2 invoices, $20 each for entity attaches
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		// Track usage on entity 1: 400 messages (300 overage = $30)
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity1Id,
			feature_id: TestFeature.Messages,
			value: 400,
		});

		// Track usage on entity 2: 200 messages (100 overage = $10)
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity2Id,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		// Cancel only entity 1 end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify entity 1 is canceling, entity 2 is still active
		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entity2AfterCancel,
			productId: pro.id,
		});

		// Advance to next invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 60,
				}),
		});

		// Verify entity 1 product removed, entity 2 still active
		const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
		const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductNotPresent({
			customer: entity1Final,
			productId: pro.id,
		});
		await expectProductActive({ customer: entity2Final, productId: pro.id });

		// Entity 2's balance should be reset (new cycle)
		expect(entity2Final.features[TestFeature.Messages].balance).toBe(100);

		// Calculate expected amounts
		// Entity 1: 400 messages - 100 included = 300 overage * $0.10 = $30
		// Entity 2: 200 messages - 100 included = 100 overage * $0.10 = $10
		// Entity 2 also renews: $20 base price
		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 400 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const entity2Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 200 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(entity1Overage).toBe(30);
		expect(entity2Overage).toBe(10);

		// Check customer invoices
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should have 3 invoices:
		// - 2 initial invoices ($20 each for entity attaches)
		// - 1 final invoice for entity 1 overage ($30) + entity 2 overage ($10) + entity 2 renewal ($20) = $60
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: entity1Overage + entity2Overage + 20,
		});
	},
);
