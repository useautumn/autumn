/**
 * Cancel End-of-Cycle Trial Entities Tests: canceling products with free trials at end of billing
 * cycle in multi-entity scenarios with merged subscriptions.
 */

import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 0: Single entity trial cancel with consumable overage - no charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1
 * - Update entity 1 to add consumable messages
 * - Track 200 messages (100 overage)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1 is removed after trial ends
 * - No overage charges (trial usage not billed)
 * - No subscription remains
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: single entity consumable overage not charged")}`,
	async () => {
		const customerId = "cancel-trial-eoc-single-ent-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [],
			trialDays: 7,
		});

		const { autumnV1, ctx, entities, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		// Update entity to add consumable messages
		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: proTrial.id,
				entity_id: entityId,
				items: [consumableItem],
			},
			{
				timeout: 5000,
			},
		);

		// Track 200 messages (100 included + 100 overage)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			value: 200,
		});

		// Cancel entity at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify entity is canceling
		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: proTrial.id,
		});

		// Advance past trial end
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 14,
		});

		// Verify entity is removed
		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: proTrial.id,
		});

		// No subscription should exist
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// No paid invoice - only $0 invoice from update
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 1,
			latestTotal: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1b: Cancel entity with consumable overage during trial - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Update entity 1 to add consumable messages
 * - Track 200 messages on entity 1 (100 overage)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1's overage during trial should NOT be charged
 * - Invoice should only include entity 2's base price ($20)
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: consumable overage during trial not charged")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [],
			trialDays: 7,
		});

		const { autumnV1, ctx, entities, advancedTo, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: proTrial.id, entityIndex: 0 }),
					s.attach({ productId: proTrial.id, entityIndex: 1 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Update entity 1 to add consumable messages
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: proTrial.id,
			entity_id: entity1Id,
			items: [consumableItem],
		});

		// Track 200 messages on entity 1 (100 included + 100 overage)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity1Id,
			value: 200,
		});

		// Cancel entity 1 at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify entity 1 is canceling
		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: proTrial.id,
		});

		// Verify entity 2 is still trialing
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductTrialing({
			customer: entity2AfterCancel,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		// Advance past trial end
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 8,
		});

		// Verify entity 1 is removed
		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: proTrial.id,
		});

		// Verify entity 2 is active
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		// Invoice should NOT include entity 1's overage charges
		// Only entity 2's base price ($20)
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// First two attaches create $0 invoice, third invoice is $0 from update, fourth is $20 for entity 2
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 4,
			latestTotal: 20, // Only entity 2's base price, NO overage from entity 1
			latestInvoiceProductId: proTrial.id,
		});
	},
);
