/** Contract: replacements preserve usage/reset state; additions inherit Stripe cycles.
 * Mixed metered/boolean transitions repoint assignments and keep Stripe converged. */
import { expect, test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import chalk from "chalk";
import { addDays } from "date-fns";
import { expectAssignmentEntitlementCyclesMatchStripe } from "../../utils/expectAssignmentEntitlementCyclesMatchStripe";
import {
	completeImmediateItemTransition,
	ITEM_TRANSITION_ENTITY_USAGES,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

const FROM_MESSAGES = 100;
const TO_MESSAGES = 500;
const WORDS = 200;

type MeteredState = {
	usage: number;
	remaining: number;
	nextResetAt: number;
};

const captureMeteredStates = async ({
	scenario,
	featureId,
	granted,
}: {
	scenario: Awaited<ReturnType<typeof setupItemTransitionScenario>>;
	featureId: string;
	granted: number;
}) => {
	const states = new Map<string, MeteredState>();
	for (let index = 0; index < scenario.entities.length; index++) {
		const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			scenario.customerId,
			scenario.entities[index].id,
		);
		const usage = ITEM_TRANSITION_ENTITY_USAGES[index];
		const balance = entity.balances[featureId];
		expectBalanceCorrect({
			customer: entity,
			featureId,
			planId: scenario.fromSeat.id,
			granted,
			remaining: granted - usage,
			usage,
		});
		expect(balance?.next_reset_at).not.toBeNull();
		states.set(scenario.entities[index].id, {
			usage,
			remaining: granted - usage,
			nextResetAt: balance?.next_reset_at ?? 0,
		});
	}
	return states;
};

const expectMessagesPreserved = async ({
	scenario,
	states,
}: {
	scenario: Awaited<ReturnType<typeof setupItemTransitionScenario>>;
	states: Map<string, MeteredState>;
}) => {
	for (const entity of scenario.entities) {
		const before = states.get(entity.id);
		if (!before) throw new Error(`Missing state for entity ${entity.id}`);
		const apiEntity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			scenario.customerId,
			entity.id,
		);
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: scenario.toSeat.id,
			granted: TO_MESSAGES,
			remaining: TO_MESSAGES - before.usage,
			usage: before.usage,
			nextResetAt: before.nextResetAt,
			toleranceMs: 0,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("license item transition: increases the monthly grant without resetting usage")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-item-replace",
			fromItems: [items.monthlyMessages({ includedUsage: FROM_MESSAGES })],
			toItems: [items.monthlyMessages({ includedUsage: TO_MESSAGES })],
			trackedFeatureIds: [TestFeature.Messages],
		});
		const states = await captureMeteredStates({
			scenario,
			featureId: TestFeature.Messages,
			granted: FROM_MESSAGES,
		});

		await completeImmediateItemTransition({ scenario });
		await expectMessagesPreserved({ scenario, states });
	},
);

test.concurrent(
	`${chalk.yellowBright("license item transition: replaces one metered item and adds metered + boolean items")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-item-add-hybrid",
			fromItems: [items.monthlyMessages({ includedUsage: FROM_MESSAGES })],
			toItems: [
				items.monthlyMessages({ includedUsage: TO_MESSAGES }),
				items.monthlyWords({ includedUsage: WORDS }),
				items.adminRights(),
			],
			trackedFeatureIds: [TestFeature.Messages],
		});
		const states = await captureMeteredStates({
			scenario,
			featureId: TestFeature.Messages,
			granted: FROM_MESSAGES,
		});

		await completeImmediateItemTransition({ scenario });
		await expectMessagesPreserved({ scenario, states });
		for (const entity of scenario.entities) {
			const apiEntity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
				scenario.customerId,
				entity.id,
			);
			expectBalanceCorrect({
				customer: apiEntity,
				featureId: TestFeature.Words,
				planId: scenario.toSeat.id,
				granted: WORDS,
				remaining: WORDS,
				usage: 0,
			});
			expectFlagCorrect({
				customer: apiEntity,
				featureId: TestFeature.AdminRights,
				planId: scenario.toSeat.id,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("license item transition: replaces one metered item and removes metered + boolean items")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-item-remove-hybrid",
			fromItems: [
				items.monthlyMessages({ includedUsage: FROM_MESSAGES }),
				items.monthlyWords({ includedUsage: WORDS }),
				items.adminRights(),
			],
			toItems: [items.monthlyMessages({ includedUsage: TO_MESSAGES })],
			trackedFeatureIds: [TestFeature.Messages, TestFeature.Words],
		});
		const states = await captureMeteredStates({
			scenario,
			featureId: TestFeature.Messages,
			granted: FROM_MESSAGES,
		});

		await completeImmediateItemTransition({ scenario });
		await expectMessagesPreserved({ scenario, states });
		for (const entity of scenario.entities) {
			const apiEntity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
				scenario.customerId,
				entity.id,
			);
			expect(apiEntity.balances[TestFeature.Words]).toBeUndefined();
			expectFlagCorrect({
				customer: apiEntity,
				featureId: TestFeature.AdminRights,
				present: false,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("license item transition: anchors a mid-cycle addition to the existing subscription")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-item-anchor-add",
			fromItems: [
				items.monthlyMessages({ includedUsage: FROM_MESSAGES }),
			],
			toItems: [
				items.monthlyMessages({ includedUsage: TO_MESSAGES }),
				items.monthlyWords({ includedUsage: WORDS }),
			],
			fromParentPrice: 20,
			toParentPrice: 50,
			testClock: true,
		});
		if (!scenario.testClockId) throw new Error("Expected a test clock");

		await advanceTestClock({
			stripeCli: scenario.ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: addDays(new Date(scenario.advancedTo), 10).getTime(),
			waitForSeconds: 5,
		});
		const { subscription: subscriptionBefore } = await getStripeSubscription({
			customerId: scenario.customerId,
		});
		const assignments = await completeImmediateItemTransition({ scenario });

		const { subscription: subscriptionAfter } =
			await expectAssignmentEntitlementCyclesMatchStripe({
				ctx: scenario.ctx,
				customerId: scenario.customerId,
				assignmentIds: assignments.map((assignment) => assignment.id),
				featureId: TestFeature.Words,
			});
		expect(subscriptionAfter.id).toBe(subscriptionBefore.id);
		expect(subscriptionAfter.billing_cycle_anchor).toBe(
			subscriptionBefore.billing_cycle_anchor,
		);
	},
);
