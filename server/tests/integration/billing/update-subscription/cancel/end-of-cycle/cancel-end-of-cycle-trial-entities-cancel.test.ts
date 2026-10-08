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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel one entity EOC, other still trialing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2 (merged subscription)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1's product should be canceling, then removed after trial ends
 * - Entity 2's product should still be trialing, then active after trial ends
 * - Invoice after trial ends should only be for 1 entity ($20)
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel one entity, other still trialing")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-one";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
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

		// Verify both entities are trialing
		const entity1AfterAttach = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductTrialing({
			customer: entity1AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
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

		// Verify entity 2 is still trialing (not affected)
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductTrialing({
			customer: entity2AfterCancel,
			productId: proTrial.id,
		});

		// Subscription should still be trialing (not fully canceled)
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeTrialing: true,
		});

		// Advance past trial end
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 10,
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

		// Verify entity 2 is active (trial ended)
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		// Invoice should only be for 1 entity ($20)
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 3,
			latestTotal: 20,
			latestInvoiceProductId: proTrial.id,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel both entities EOC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2 (merged subscription)
 * - Cancel entity 1 at end of cycle
 * - Cancel entity 2 at end of cycle
 *
 * Expected Result:
 * - Both entities' products should be canceling
 * - Subscription should be canceling
 * - After advancing past trial end:
 *   - Both products removed
 *   - No subscription
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel both entities EOC")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-both";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
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

		// Verify both entities are trialing
		const entity1AfterAttach = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductTrialing({
			customer: entity1AfterAttach,
			productId: proTrial.id,
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
		});

		// Cancel entity 1 at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Cancel entity 2 at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify both entities are canceling
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
			productId: proTrial.id,
		});

		await expectProductCanceling({
			customer: entity2AfterCancel,
			productId: proTrial.id,
		});

		// Subscription should be canceling and trialing
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeTrialing: true,
			shouldBeCanceled: true,
		});

		// Advance past trial end
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify both entities' products are removed
		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: proTrial.id,
		});

		await expectProductNotPresent({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		// No subscription should exist
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
