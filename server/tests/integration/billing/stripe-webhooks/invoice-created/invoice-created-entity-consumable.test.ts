/**
 * Invoice Created Webhook Tests - Entity Consumables (Renewal)
 *
 * Slice 1 of 2: regular renewal + 4 entities on 2 products.
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
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { waitForEntityUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
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
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		// Let the attach's Stripe webhooks land BEFORE tracking: one arriving inside
		// the track→sync window deletes the cached balance and the deduction is
		// dropped, so the renewal invoice comes back short by exactly the overage.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

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
				s.attach({ productId: premium.id, entityIndex: 3 }),
			],
		});

		// Four attaches means four subscriptions' worth of Stripe webhooks still in
		// flight. Let them land BEFORE tracking — one arriving inside a track→sync
		// window drops that deduction and the renewal invoice comes back short.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Pro: 55 / 23 overage → $6 / $3. Premium: 75 / 151 overage → $6 / $14.
		const trackedUsage = [
			{ value: 155, balance: -55 },
			{ value: 123, balance: -23 },
			{ value: 275, balance: -75 },
			{ value: 351, balance: -151 },
		];

		for (const [index, { value }] of trackedUsage.entries()) {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entities[index].id,
				feature_id: TestFeature.Messages,
				value,
			});
		}

		// Verify overage tracked for all entities (gated on Postgres)
		for (const [index, { balance }] of trackedUsage.entries()) {
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
