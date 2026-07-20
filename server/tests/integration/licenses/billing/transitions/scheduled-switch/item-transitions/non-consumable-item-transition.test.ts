/** Scheduled child-license downgrades preserve each assignment's non-consumable usage.
 * Assignments repoint only when the incoming parent activates. */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import chalk from "chalk";
import { addHours } from "date-fns";
import {
	ITEM_TRANSITION_ENTITY_COUNT,
	ITEM_TRANSITION_ENTITY_USAGES,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

const FROM_WORKFLOWS = 500;
const TO_WORKFLOWS = 100;

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: carries workflow usage to the downgraded child plan")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-workflows-scheduled",
			fromItems: [
				items.freeAllocatedWorkflows({ includedUsage: FROM_WORKFLOWS }),
			],
			toItems: [items.freeAllocatedWorkflows({ includedUsage: TO_WORKFLOWS })],
			trackedFeatureIds: [TestFeature.Workflows],
			fromParentPrice: 20,
			testClock: true,
		});
		const assignmentsBefore = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId: scenario.customerId,
			licensePlanId: scenario.fromSeat.id,
			active: true,
		});
		const assignmentIds = assignmentsBefore.map(({ id }) => id).sort();
		const params: AttachParamsV1Input = {
			customer_id: scenario.customerId,
			plan_id: scenario.toParent.id,
			redirect_mode: "if_required",
		};

		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>(params);

		const midCycle = await scenario.autumnV2_3.customers.get<ApiCustomerV5>(
			scenario.customerId,
		);
		await expectCustomerProducts({
			customer: midCycle,
			canceling: [scenario.fromParent.id],
			scheduled: [scenario.toParent.id],
		});
		const assignmentsMidCycle = await listLicenseAssignments({
			autumn: scenario.autumnV2_3,
			customerId: scenario.customerId,
			licensePlanId: scenario.fromSeat.id,
			active: true,
		});
		expect(assignmentsMidCycle.map(({ id }) => id).sort()).toEqual(
			assignmentIds,
		);

		const { billingPeriod } = await getBillingPeriod({
			customerId: scenario.customerId,
		});
		if (!scenario.testClockId) throw new Error("Expected a test clock");
		await advanceTestClock({
			stripeCli: scenario.ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: billingPeriod.end,
			waitForSeconds: 10,
		});
		await advanceTestClock({
			stripeCli: scenario.ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: addHours(
				new Date(billingPeriod.end),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 10,
		});

		const assignmentsAfter = await pollUntil({
			fetch: () =>
				listLicenseAssignments({
					autumn: scenario.autumnV2_3,
					customerId: scenario.customerId,
					licensePlanId: scenario.toSeat.id,
					active: true,
				}),
			until: (assignments) =>
				assignments.length === ITEM_TRANSITION_ENTITY_COUNT,
		});
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

		const customer = await scenario.autumnV2_3.customers.get<ApiCustomerV5>(
			scenario.customerId,
		);
		await expectCustomerProducts({
			customer,
			active: [scenario.toParent.id],
			notPresent: [scenario.fromParent.id],
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId: scenario.customerId,
		});
	},
);
