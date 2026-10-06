/**
 * Cancel End-of-Cycle Trial Entities Tests: canceling products with free trials at end of billing
 * cycle in multi-entity scenarios with merged subscriptions.
 */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancel entity 1 EOC after trial ends (active billing period)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Advance past trial end (both entities now active/paying)
 * - Cancel entity 1 at end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Entity 1's product should be canceling after cancel request
 * - After advancing to next invoice:
 *   - Entity 1's product is removed
 *   - Entity 2's product is still active
 */
test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1 EOC after trial ends")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-after-trial";

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
					s.advanceTestClock({ days: 12 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		// Verify both entities are now active (no longer trialing)
		const entity1AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductActive({
			customer: entity1AfterTrialEnd,
			productId: proTrial.id,
		});
		await expectProductNotTrialing({
			customer: entity1AfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		await expectProductActive({
			customer: entity2AfterTrialEnd,
			productId: proTrial.id,
		});
		await expectProductNotTrialing({
			customer: entity2AfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		// Cancel entity 1 at end of cycle (now in active billing period)
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

		// Verify entity 2 is still active (not affected)
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterCancel,
			productId: proTrial.id,
		});

		// Advance to next invoice (from advancedTo + 7 days trial + ~23 days to complete month)
		// Using advanceToNextInvoice to properly advance to the billing cycle end
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(12) + ms.days(30), // Trial end + 1 month
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

		// Verify entity 2's product is still active
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		// Subscription should still exist for entity 2
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);
