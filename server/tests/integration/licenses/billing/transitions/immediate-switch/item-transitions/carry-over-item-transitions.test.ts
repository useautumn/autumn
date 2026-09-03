/** Contract: carry_over_usages on the upgrade attach carries seat usage through
 * a license item transition, mirroring the attach param's semantics:
 * - { enabled: true } carries every consumable feature (remaining = grant - usage)
 * - feature_ids narrows the carry — unlisted consumables reset to full grant
 * - { enabled: false } is the explicit reset (same as the default)
 */
import { test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	completeImmediateItemTransition,
	ITEM_TRANSITION_ENTITY_USAGES,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

const FROM_MESSAGES = 100;
const TO_MESSAGES = 500;
const FROM_WORDS = 200;
const TO_WORDS = 800;

const expectEntityBalances = async ({
	scenario,
	featureId,
	granted,
	carried,
}: {
	scenario: Awaited<ReturnType<typeof setupItemTransitionScenario>>;
	featureId: string;
	granted: number;
	carried: boolean;
}) => {
	for (let index = 0; index < scenario.entities.length; index++) {
		const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			scenario.customerId,
			scenario.entities[index].id,
		);
		const usage = carried ? ITEM_TRANSITION_ENTITY_USAGES[index] : 0;
		expectBalanceCorrect({
			customer: entity,
			featureId,
			planId: scenario.toSeat.id,
			granted,
			remaining: granted - usage,
			usage,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("license carry-over transition: enabled carries seat usage into the new grant")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-carry-all",
			fromItems: [items.monthlyMessages({ includedUsage: FROM_MESSAGES })],
			toItems: [items.monthlyMessages({ includedUsage: TO_MESSAGES })],
			trackedFeatureIds: [TestFeature.Messages],
		});

		await completeImmediateItemTransition({
			scenario,
			carryOverUsages: { enabled: true },
		});
		await expectEntityBalances({
			scenario,
			featureId: TestFeature.Messages,
			granted: TO_MESSAGES,
			carried: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license carry-over transition: feature_ids carries listed features and resets the rest")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-carry-filtered",
			fromItems: [
				items.monthlyMessages({ includedUsage: FROM_MESSAGES }),
				items.monthlyWords({ includedUsage: FROM_WORDS }),
			],
			toItems: [
				items.monthlyMessages({ includedUsage: TO_MESSAGES }),
				items.monthlyWords({ includedUsage: TO_WORDS }),
			],
			trackedFeatureIds: [TestFeature.Messages, TestFeature.Words],
		});

		await completeImmediateItemTransition({
			scenario,
			carryOverUsages: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		});
		await expectEntityBalances({
			scenario,
			featureId: TestFeature.Messages,
			granted: TO_MESSAGES,
			carried: true,
		});
		await expectEntityBalances({
			scenario,
			featureId: TestFeature.Words,
			granted: TO_WORDS,
			carried: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license carry-over transition: explicit disabled resets seat usage")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-carry-disabled",
			fromItems: [items.monthlyMessages({ includedUsage: FROM_MESSAGES })],
			toItems: [items.monthlyMessages({ includedUsage: TO_MESSAGES })],
			trackedFeatureIds: [TestFeature.Messages],
		});

		await completeImmediateItemTransition({
			scenario,
			carryOverUsages: { enabled: false },
		});
		await expectEntityBalances({
			scenario,
			featureId: TestFeature.Messages,
			granted: TO_MESSAGES,
			carried: false,
		});
	},
);
