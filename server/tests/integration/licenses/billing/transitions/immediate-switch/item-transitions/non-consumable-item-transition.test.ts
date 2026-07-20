/** Immediate child-license upgrades preserve each assignment's non-consumable usage.
 * The incoming entitlement replaces the grant without replacing the assignment. */
import { expect, test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import {
	completeImmediateItemTransition,
	ITEM_TRANSITION_ENTITY_COUNT,
	ITEM_TRANSITION_ENTITY_USAGES,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

const FROM_WORKFLOWS = 100;
const TO_WORKFLOWS = 500;

test.concurrent(
	`${chalk.yellowBright("license immediate transition: carries workflow usage to the upgraded child plan")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-workflows-immediate",
			fromItems: [
				items.freeAllocatedWorkflows({ includedUsage: FROM_WORKFLOWS }),
			],
			toItems: [items.freeAllocatedWorkflows({ includedUsage: TO_WORKFLOWS })],
			trackedFeatureIds: [TestFeature.Workflows],
			toParentPrice: 20,
		});
		const assignmentsBefore = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId: scenario.customerId,
			licensePlanId: scenario.fromSeat.id,
			active: true,
		});
		const assignmentIds = assignmentsBefore.map(({ id }) => id).sort();

		for (let index = 0; index < scenario.entities.length; index++) {
			const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
				scenario.customerId,
				scenario.entities[index].id,
			);
			const usage = ITEM_TRANSITION_ENTITY_USAGES[index];
			expectBalanceCorrect({
				customer: entity,
				featureId: TestFeature.Workflows,
				planId: scenario.fromSeat.id,
				granted: FROM_WORKFLOWS,
				usage,
				remaining: FROM_WORKFLOWS - usage,
			});
		}

		await completeImmediateItemTransition({ scenario });

		const assignmentsAfter = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId: scenario.customerId,
			licensePlanId: scenario.toSeat.id,
			active: true,
		});
		expect(assignmentsAfter).toHaveLength(ITEM_TRANSITION_ENTITY_COUNT);
		expect(assignmentsAfter.map(({ id }) => id).sort()).toEqual(assignmentIds);

		for (let index = 0; index < scenario.entities.length; index++) {
			const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
				scenario.customerId,
				scenario.entities[index].id,
			);
			const usage = ITEM_TRANSITION_ENTITY_USAGES[index];
			expectBalanceCorrect({
				customer: entity,
				featureId: TestFeature.Workflows,
				planId: scenario.toSeat.id,
				granted: TO_WORKFLOWS,
				usage,
				remaining: TO_WORKFLOWS - usage,
			});
		}
	},
);
