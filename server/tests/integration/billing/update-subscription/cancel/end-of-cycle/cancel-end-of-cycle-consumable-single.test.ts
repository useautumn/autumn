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
// TEST 1: Track → cancel end of cycle → advance (customer-level)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $40 (400 overage * $0.10)
 * - Product removed after cycle ends
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: customer - track overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-cus";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1Beta, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Verify pro is active
		const customerAfterAttach =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		// Initial attach invoice: $20 base price
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20,
		});

		// Track 500 messages (100 included, 400 overage)
		await autumnV1Beta.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		// Cancel end of cycle
		await autumnV1Beta.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify pro is canceling
		const customerAfterCancel =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		// Advance to next invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1Beta,
					count: 2,
					latestTotal: 40,
				}),
		});

		// Calculate expected overage amount
		// 500 total usage - 100 included = 400 overage * $0.10 = $40
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 500 }],
			options: { includeFixed: false, onlyArrear: true },
		});

		expect(expectedOverage).toBe(40);

		// Verify final state
		const customerAfterAdvance =
			await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);

		// Product should be removed
		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		// Should have 2 invoices: initial ($20) + final overage ($40)
		expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductId: pro.id,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Track → cancel end of cycle → advance (entity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages on entity (400 overage)
 * - Cancel entity's product end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $40 (400 overage * $0.10)
 * - Entity product removed after cycle ends
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity - track overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-ent";

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
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		// Verify pro is active on entity
		const entity = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entity,
			productId: pro.id,
		});

		// Track 500 messages on entity (100 included, 400 overage)
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		// Cancel entity's product end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify pro is canceling on entity
		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
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
					count: 2,
					latestTotal: 40,
				}),
		});

		// Verify final state
		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		// Product should be removed from entity
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: pro.id,
		});

		// Check customer invoices (invoices are at customer level)
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Should have 2 invoices: initial ($20) + final overage ($40)
		expect(customerAfterAdvance.invoices?.length).toBe(2);

		// Final invoice should be overage: 400 * $0.10 = $40
		expect(customerAfterAdvance.invoices?.[0].total).toBe(40);
	},
);
