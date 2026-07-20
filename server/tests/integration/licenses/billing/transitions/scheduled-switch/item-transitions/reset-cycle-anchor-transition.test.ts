/** Scheduled paid license downgrades retain the Stripe subscription cycle anchor. */
import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import chalk from "chalk";
import { addHours } from "date-fns";
import { expectAssignmentEntitlementCyclesMatchStripe } from "../../utils/expectAssignmentEntitlementCyclesMatchStripe";
import {
	ITEM_TRANSITION_ENTITY_COUNT,
	setupItemTransitionScenario,
} from "../../utils/itemTransitionTestUtils";

test.concurrent(
	`${chalk.yellowBright("license scheduled transition: aligns assignment cycles after a paid downgrade")}`,
	async () => {
		const scenario = await setupItemTransitionScenario({
			idPrefix: "license-anchor-downgrade",
			fromItems: [items.monthlyMessages({ includedUsage: 500 })],
			toItems: [items.monthlyMessages({ includedUsage: 100 })],
			fromParentPrice: 50,
			toParentPrice: 20,
			testClock: true,
		});
		if (!scenario.testClockId) throw new Error("Expected a test clock");
		const { subscription: subscriptionBefore } = await getStripeSubscription({
			customerId: scenario.customerId,
		});

		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: scenario.customerId,
			plan_id: scenario.toParent.id,
			redirect_mode: "if_required",
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId: scenario.customerId,
		});

		const { billingPeriod } = await getBillingPeriod({
			customerId: scenario.customerId,
		});
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

		const assignments = await pollUntil({
			fetch: () =>
				listLicenseAssignments({
					autumn: scenario.autumnV2_3,
					customerId: scenario.customerId,
					licensePlanId: scenario.toSeat.id,
					active: true,
				}),
			until: (rows) => rows.length === ITEM_TRANSITION_ENTITY_COUNT,
		});
		const { subscription: subscriptionAfter } =
			await expectAssignmentEntitlementCyclesMatchStripe({
				ctx: scenario.ctx,
				customerId: scenario.customerId,
				assignmentIds: assignments.map((assignment) => assignment.id),
				featureId: TestFeature.Messages,
				expectNextResetAt: false,
			});

		expect(subscriptionAfter.id).toBe(subscriptionBefore.id);
		expect(subscriptionAfter.billing_cycle_anchor).toBe(
			subscriptionBefore.billing_cycle_anchor,
		);
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId: scenario.customerId,
		});
	},
);
