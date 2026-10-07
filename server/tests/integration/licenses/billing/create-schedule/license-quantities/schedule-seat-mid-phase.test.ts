/**
 * Contract: adding seats mid-phase with billing.update while a create_schedule
 * ramp is running.
 *
 *  - The update bills a prorated seat delta for the rest of the current phase.
 *  - The booked later phase keeps its own seat count: the preview's next cycle
 *    and the invoice at the phase boundary bill it, not the mid-phase count.
 *  - Autumn's view of the Stripe subscription + schedule stays consistent.
 */
import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreateScheduleParamsV0Input,
	StartingAfterDuration,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectScheduledLicensePools } from "@tests/integration/licenses/utils/expectScheduledLicensePools";
import { TestFeature } from "@tests/setup/v2Features";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";
import {
	advanceToNextPhase,
	buildSeatPlans,
	SEAT_PRICE,
	seatPhaseTotal,
} from "./utils/scheduleSeatTestUtils";

const ASSIGNED_SEATS = 5;
const MID_PHASE_SEATS = 7;
const NEXT_PHASE_SEATS = 10;

test.concurrent(
	`${chalk.yellowBright("schedule seat mid-phase update: added seats prorate now and the next phase keeps its count")}`,
	async () => {
		const customerId = "sched-seat-mid-phase";
		const { parent, seat } = buildSeatPlans({ prefix: "ssm-mid" });

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: ASSIGNED_SEATS, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
			],
		});
		const { ctx, autumnV1, autumnV2_3, entities } = scenario;

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: parent.id,
							license_quantities: [
								{ license_plan_id: seat.id, quantity: ASSIGNED_SEATS },
							],
						},
					],
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 1,
					},
					plans: [
						{
							plan_id: parent.id,
							license_quantities: [
								{ license_plan_id: seat.id, quantity: NEXT_PHASE_SEATS },
							],
						},
					],
				},
			],
		});
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: entities.map((entity) => ({ entity_id: entity.id })),
		});

		if (!scenario.testClockId) throw new Error("Expected a test clock");
		const midPhaseAt = addDays(new Date(scenario.advancedTo), 14).getTime();
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: scenario.testClockId,
			advanceTo: midPhaseAt,
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [
				{ license_plan_id: seat.id, quantity: MID_PHASE_SEATS },
			],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(new Date(scenario.advancedTo), 1).getTime(),
			total: seatPhaseTotal({ paidSeats: NEXT_PHASE_SEATS }),
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		// Mid-phase: prorated delta for 2 seats, live pool grows, phase 2 untouched.
		const proratedSeatDelta = await calculateProratedDiff({
			customerId,
			advancedTo: midPhaseAt,
			oldAmount: ASSIGNED_SEATS * SEAT_PRICE,
			newAmount: MID_PHASE_SEATS * SEAT_PRICE,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: proratedSeatDelta,
		});
		expectCustomerLicenses({
			customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: MID_PHASE_SEATS,
					usage: ASSIGNED_SEATS,
					paid_quantity: MID_PHASE_SEATS,
				},
			],
		});
		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: parent.id,
			licenses: [
				{
					licensePlanId: seat.id,
					granted: NEXT_PHASE_SEATS,
					paidQuantity: NEXT_PHASE_SEATS,
				},
			],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Phase 2 takes over with its booked count, not the mid-phase one.
		await advanceToNextPhase({ scenario });

		expectCustomerLicenses({
			customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: NEXT_PHASE_SEATS,
					usage: ASSIGNED_SEATS,
					paid_quantity: NEXT_PHASE_SEATS,
				},
			],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: seatPhaseTotal({ paidSeats: NEXT_PHASE_SEATS }),
		});
	},
);
