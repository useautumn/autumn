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
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel one entity, attach pro to other (next cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premiumTrial to entity 1 and entity 2
 * - Cancel entity 1 at end of cycle
 * - Attach pro to entity 2 (downgrade - scheduled for next cycle)
 *
 * Expected Result:
 * - Entity 1's premium should be canceling
 * - Entity 2's premium should be canceling with pro scheduled
 * - After advancing past trial end:
 *   - Entity 1's product is removed
 *   - Entity 2 is on pro (active)
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel one, attach pro to other (next cycle)")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-downgrade";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const premiumTrial = products.premiumWithTrial({
			id: "premium-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premiumTrial, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premiumTrial.id, entityIndex: 0 }),
				s.attach({ productId: premiumTrial.id, entityIndex: 1 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Verify both entities are trialing on premium
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
			productId: premiumTrial.id,
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: premiumTrial.id,
		});

		// Cancel entity 1 at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: premiumTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Attach pro to entity 2 (downgrade - scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: pro.id,
		});

		// Verify entity 1's premium is canceling
		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: premiumTrial.id,
		});

		// Verify entity 2's premium is canceling and pro is scheduled
		const entity2AfterDowngrade = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity2AfterDowngrade,
			productId: premiumTrial.id,
		});
		await expectProductScheduled({
			customer: entity2AfterDowngrade,
			productId: pro.id,
		});

		// Advance past trial end
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify entity 1's product is removed
		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: premiumTrial.id,
		});

		// Verify entity 2 is now on pro (active)
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductNotPresent({
			customer: entity2AfterAdvance,
			productId: premiumTrial.id,
		});
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: pro.id,
		});

		// Subscription should exist for entity 2's pro
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel entity 1, attach proTrial to entity 2 creates schedule
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1
 * - Cancel entity 1 at end of cycle
 * - Attach proTrial to entity 2
 *
 * Expected Result:
 * - Entity 1's product should be canceling
 * - Entity 2's product should be trialing (merges with existing trialing sub)
 * - After advancing past trial end:
 *   - Entity 1's product is removed
 *   - Entity 2 is on proTrial (active, no longer trialing - trial ended)
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1, attach proTrial to entity 2")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-attach";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		let { autumnV1, ctx, testClockId, entities, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: proTrial.id, entityIndex: 0, timeout: 8000 }),

					// Cancel entity 1 at end of cycle
					s.updateSubscription({
						productId: proTrial.id,
						entityIndex: 0,
						cancelAction: "cancel_end_of_cycle",
					}),

					// Attach proTrial to entity 2
					s.attach({ productId: proTrial.id, entityIndex: 1, timeout: 8000 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Verify entity 2 is trialing (merged with existing subscription)
		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		await expectProductActive({
			customer: entity2AfterAttach,
			productId: proTrial.id,
		});

		// return;

		// Advance past trial end
		advancedTo = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify entity 1's product is removed
		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: proTrial.id,
		});

		// Verify entity 2 is active (trial ended, now paying)
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		// Not trialing anymore (trial ended)
		await expectProductNotTrialing({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		// Subscription should exist for entity 2
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});

		// Should have invoice for entity 2's subscription after trial
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 3,
			latestTotal: 20,
		});
	},
);
