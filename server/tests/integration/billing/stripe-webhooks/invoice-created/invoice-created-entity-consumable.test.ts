/**
 * Invoice Created Webhook Tests - Entity Consumables (Renewal)
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
import {
	pollEntityUntil,
	waitForEntityUsageInDb,
} from "@tests/integration/billing/utils/pollEntityState";
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

		// Verify overage tracked — gate on Postgres, since invoice.created bills the
		// arrear line items off the DB row, not the cached balance.
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			balance: -400,
		});

		// Advance to next cycle (regular renewal)
		const advancedTo = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Product still active and balance reset to 100 — both land on the
		// invoice.created webhook, so poll rather than read once.
		const entityFinal = await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId,
			assert: (entity) =>
				expectCustomerFeatureCorrect({
					customer: entity,
					featureId: TestFeature.Messages,
					balance: 100,
					resetsAt: addMonths(Date.now(), 2).getTime(),
				}),
		});
		await expectProductActive({
			customer: entityFinal,
			productId: pro.id,
		});

		// Expected invoices:
		// 1. Initial attach: $20
		// 2. Renewal: $20 base + $40 overage = $60
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
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
				s.attach({ productId: premium.id, entityIndex: 1, timeout: 2000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 175,
					entityIndex: 0,
				}), // 75 overage
				s.track({
					featureId: TestFeature.Messages,
					value: 289,
					entityIndex: 1,
				}), // 89 overage
			],
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2c: Complex - 2 products, 4 entities (2 on each product)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/month): 100 included, $1/10 units, billingUnits=10
 *   - Entity 1: Track 155 messages → 55 overage → rounds to 60 → $6
 *   - Entity 2: Track 123 messages → 23 overage → rounds to 30 → $3
 * - Premium product ($50/month): 200 included, $2/25 units, billingUnits=25
 *   - Entity 3: Track 275 messages → 75 overage → rounds to 75 → $6
 *   - Entity 4: Track 351 messages → 151 overage → rounds to 175 → $14
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Pro entities overage: $6 + $3 = $9
 * - Premium entities overage: $6 + $14 = $20
 * - Total overage: $29
 * - Renewal invoice: $20*2 + $50*2 + $29 = $169
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created entity: 4 entities, 2 products (2 each) → advance cycle")}`,
	async () => {
		const customerId = "inv-ent-4ent-2prod";

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

		// Premium is $50/month base
		const premium = products.base({
			id: "premium",
			items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 4, featureId: TestFeature.Users }),
			],
			actions: [
				// Attach pro to entities 0 and 1
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				// Attach premium to entities 2 and 3
				s.attach({ productId: premium.id, entityIndex: 2 }),
				s.attach({ productId: premium.id, entityIndex: 3, timeout: 2000 }),
				// Track usage
				s.track({
					featureId: TestFeature.Messages,
					value: 155,
					entityIndex: 0,
				}), // Pro: 55 overage → $6
				s.track({
					featureId: TestFeature.Messages,
					value: 123,
					entityIndex: 1,
				}), // Pro: 23 overage → $3
				s.track({
					featureId: TestFeature.Messages,
					value: 275,
					entityIndex: 2,
				}), // Premium: 75 overage → $6
				s.track({
					featureId: TestFeature.Messages,
					value: 351,
					entityIndex: 3,
				}), // Premium: 151 overage → $14
			],
		});

		// Verify overage tracked for all entities (gated on Postgres)
		const trackedBalances = [-55, -23, -75, -151];
		for (const [index, balance] of trackedBalances.entries()) {
			await waitForEntityUsageInDb({
				autumn: autumnV1,
				customerId,
				entityId: entities[index].id,
				featureId: TestFeature.Messages,
				balance,
			});
		}

		// Advance to next cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify all entities still active with reset balances
		const resetBalances = [
			{ productId: pro.id, balance: 100 },
			{ productId: pro.id, balance: 100 },
			{ productId: premium.id, balance: 200 },
			{ productId: premium.id, balance: 200 },
		];
		for (const [index, { productId, balance }] of resetBalances.entries()) {
			const entityFinal = await pollEntityUntil({
				autumn: autumnV1,
				customerId,
				entityId: entities[index].id,
				assert: (entity) =>
					expectCustomerFeatureCorrect({
						customer: entity,
						featureId: TestFeature.Messages,
						balance,
					}),
			});
			await expectProductActive({ customer: entityFinal, productId });
		}

		// Pro entities (each rounded individually):
		// Entity 1: ceil(55/10) = 6 → $6
		// Entity 2: ceil(23/10) = 3 → $3
		// Pro total overage: $9

		// Premium entities (each rounded individually):
		// Entity 3: ceil(75/25) = 3 → $6
		// Entity 4: ceil(151/25) = 7 → $14
		// Premium total overage: $20

		// Total overage: $29
		// Initial invoices: $20 + $20 + $50 + $50 = $140
		// Renewal: $20 + $20 + $50 + $50 + $29 = $169
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 5, // 4 initial attaches + 1 renewal
			latestTotal: 169,
		});
	},
);
