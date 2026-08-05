/**
 * Invoice Created Webhook Tests - Entity Consumables (Renewal)
 *
 * Slice 2 of 2: per-entity billing-unit rounding scenarios.
 *
 * Tests for handling the `invoice.created` Stripe webhook for entity-level
 * consumable products during regular renewal cycles.
 *
 * Key behaviors:
 * - Entity-level consumables use invoice line items method (added during invoice.created)
 * - Overage is billed exactly once via invoice line items
 * - Balance resets after each cycle
 * - Each entity's overage is rounded up to billing units INDIVIDUALLY
 *
 * For cancel-related consumable tests, see:
 * - cancel/end-of-cycle/cancel-end-of-cycle-consumable.test.ts
 * - cancel/immediately/cancel-immediately-consumable.test.ts
 */

import { test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { pollEntityUntil } from "@tests/integration/billing/utils/pollEntityState";
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForEntityUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		// Both attaches' Stripe webhooks first, then track: one arriving inside the
		// track→sync window drops the deduction and the renewal invoice is short.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// 55 overage → $6
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 155,
		});

		// 23 overage → $3
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 123,
		});

		// Verify overage tracked (gated on Postgres — see waitForEntityUsageInDb)
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			balance: -55,
		});

		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			balance: -23,
		});

		// Advance to next cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify entities still active with reset balances
		const entity1Final = await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId: entities[0].id,
			assert: (entity) =>
				expectCustomerFeatureCorrect({
					customer: entity,
					featureId: TestFeature.Messages,
					balance: 100,
				}),
		});
		await expectProductActive({
			customer: entity1Final,
			productId: pro.id,
		});

		const entity2Final = await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId: entities[1].id,
			assert: (entity) =>
				expectCustomerFeatureCorrect({
					customer: entity,
					featureId: TestFeature.Messages,
					balance: 100,
				}),
		});
		await expectProductActive({
			customer: entity2Final,
			productId: pro.id,
		});

		// Entity products: each entity's overage rounded individually
		// Entity 1: ceil(55/10) = 6 → $6
		// Entity 2: ceil(23/10) = 3 → $3
		// Total overage: $9
		// Initial invoices: $20 * 2 = $40
		// Renewal: $20 * 2 + $9 = $49
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 3, // 2 initial attaches + 1 renewal
			latestTotal: 49,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2b: 2 entities on 2 different products with different consumable configs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Pro product ($20/month) with consumable messages
 *   (100 included, $1/10 units, billingUnits=10)
 * - Entity 2: Premium product ($50/month) with consumable messages
 *   (200 included, $2/25 units, billingUnits=25)
 * - Entity 1: Track 175 messages → 75 overage → rounds to 80 → $8
 * - Entity 2: Track 289 messages → 89 overage → rounds to 100 → $8
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Entity 1 overage: ceil(75/10) * $1 = $8
 * - Entity 2 overage: ceil(89/25) * $2 = $8
 * - Total overage: $16
 * - Renewal invoice: $20 + $50 + $16 = $86
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created entity: 2 entities, 2 different products → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-2prod-2ent";

		// Pro: $1 per 10 units, 100 included
		const proConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 1,
			billingUnits: 10,
		});

		// Premium: $2 per 25 units, 200 included
		const premiumConsumable = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 200,
			price: 2,
			billingUnits: 25,
		});

		const pro = products.pro({
			id: "pro",
			items: [proConsumable],
		});

		// Premium is $50/month base (use base product with custom price)
		const premium = products.base({
			id: "premium",
			items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		// Both attaches' Stripe webhooks first, then track: one arriving inside the
		// track→sync window drops the deduction and the renewal invoice is short.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// 75 overage
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 175,
		});

		// 89 overage
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 289,
		});

		// Verify overage tracked (gated on Postgres — see waitForEntityUsageInDb)
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			balance: -75,
		});

		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			balance: -89,
		});

		// Advance to next cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify entities still active with reset balances
		const entity1Final = await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId: entities[0].id,
			assert: (entity) =>
				expectCustomerFeatureCorrect({
					customer: entity,
					featureId: TestFeature.Messages,
					balance: 100,
				}),
		});
		await expectProductActive({
			customer: entity1Final,
			productId: pro.id,
		});

		const entity2Final = await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId: entities[1].id,
			assert: (entity) =>
				expectCustomerFeatureCorrect({
					customer: entity,
					featureId: TestFeature.Messages,
					balance: 200,
				}),
		});
		await expectProductActive({
			customer: entity2Final,
			productId: premium.id,
		});

		// Entity 1: ceil(75/10) = 8 → $8
		// Entity 2: ceil(89/25) = 4 → $8
		// Total overage: $16
		// Initial invoices: $20 + $50 = $70
		// Renewal: $20 + $50 + $16 = $86
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 3, // 2 initial attaches + 1 renewal
			latestTotal: 86,
		});
	},
);
