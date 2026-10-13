/**
 * Invoice Created Webhook Tests - Entity Consumables (Renewal): entity-level overage is billed once via
 * invoice line items, rounded to billing units per entity, and balances reset each cycle.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Regular cycle renewal (no cancel) - entity consumable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages
 * - Track overage on entity
 * - Advance to next cycle (no cancel, just regular renewal)
 *
 * This tests the normal happy path for invoice.created with entity consumables.
 *
 * Expected Result:
 * - Renewal invoice includes base price + overage
 * - Overage billed exactly once via invoice line items
 * - Balance resets after cycle
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created entity: regular renewal - overage billed once")}`,
	async () => {
		const customerId = "inv-created-ent-renewal";

		// Entity-level consumable messages

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 500,
					entityIndex: 0,
				}),
			],
		});

		const entityId = entities[0].id;

		// Verify overage tracked
		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

		// Advance to next cycle (regular renewal)
		const advancedTo = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		// Verify product still active
		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entityFinal,
			productId: pro.id,
		});

		// Balance should reset to 100
		expectCustomerFeatureCorrect({
			customer: entityFinal,
			featureId: TestFeature.Messages,
			balance: 100,
			resetsAt: addMonths(Date.now(), 2).getTime(),
		});

		// Check invoices
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Expected invoices:
		// 1. Initial attach: $20
		// 2. Renewal: $20 base + $40 overage = $60
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 2,
			latestTotal: 60,
		});

		// Verify line item billing periods are correct (now -> now + 1 month)
		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: pro.id,
			periodStartMs: Date.now(),
			periodEndMs: advancedTo,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity consumable with billing units - multiple entities (per-entity rounding)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - 2 entities, each with their own Pro product ($20/month base)
 * - Consumable messages: 100 included, $1/10 units, billingUnits=10
 * - Entity 1: Track 155 messages → 55 overage → rounds UP to 60 → $6
 * - Entity 2: Track 123 messages → 23 overage → rounds UP to 30 → $3
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Entity 1 overage: ceil(55/10) * $1 = $6
 * - Entity 2 overage: ceil(23/10) * $1 = $3
 * - Total overage: $9
 * - Renewal invoice: $20 base * 2 + $9 overage = $49
 *
 * IMPORTANT: For ENTITY PRODUCTS (attached TO entities), each entity's overage
 * is rounded up to billing units INDIVIDUALLY, then summed.
 * This is DIFFERENT from per-entity features where total is summed first then rounded.
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created entity: billing units - each entity rounded individually → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-billing-units";

		// Consumable with billingUnits=10, $1 per 10 units
		const consumableItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1, // $1 per 10 units
			billingUnits: 10,
		});

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
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 2000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 155,
					entityIndex: 0,
				}), // 55 overage → $6
				s.track({
					featureId: TestFeature.Messages,
					value: 123,
					entityIndex: 1,
				}), // 23 overage → $3
			],
		});

		// Verify overage tracked
		const entity1AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-55);

		const entity2AfterTrack = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-23);

		// Advance to next cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		// Verify entities still active with reset balances
		const entity1Final = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1Final,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity1Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		const entity2Final = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Final,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity2Final,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		// Check invoices
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Entity products: each entity's overage rounded individually
		// Entity 1: ceil(55/10) = 6 → $6
		// Entity 2: ceil(23/10) = 3 → $3
		// Total overage: $9
		// Initial invoices: $20 * 2 = $40
		// Renewal: $20 * 2 + $9 = $49
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3, // 2 initial attaches + 1 renewal
			latestTotal: 49,
		});
	},
);
