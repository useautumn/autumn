/** Scheduled paid→free seat switches keep the same messages entitlement.
 * Activation resolves carry from the org transition rule only — the original
 * attach's carry_over_usages is not persisted — so default is a usage reset. */
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

const MESSAGES = 250;

const completeScheduledRetainedTransition = async ({
	idPrefix,
}: {
	idPrefix: string;
}) => {
	const scenario = await setupItemTransitionScenario({
		idPrefix,
		fromItems: [items.monthlyMessages({ includedUsage: MESSAGES })],
		toItems: [items.monthlyMessages({ includedUsage: MESSAGES })],
		trackedFeatureIds: [TestFeature.Messages],
		fromParentPrice: 50,
		toParentPrice: 20,
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
	for (let index = 0; index < scenario.entities.length; index++) {
		const entity = await scenario.autumnV2_3.entities.get<ApiEntityV2>(
			scenario.customerId,
			scenario.entities[index].id,
		);
		const usage = ITEM_TRANSITION_ENTITY_USAGES[index];
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			planId: scenario.fromSeat.id,
			granted: MESSAGES,
			usage,
			remaining: MESSAGES - usage,
		});
	}

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
		const usage = 0;
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			planId: scenario.toSeat.id,
			granted: MESSAGES,
			usage,
			remaining: MESSAGES - usage,
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
};

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: resets retained consumable usage at activation")}`,
	async () => {
		await completeScheduledRetainedTransition({
			idPrefix: "license-retained-sched-reset",
		});
	},
);
