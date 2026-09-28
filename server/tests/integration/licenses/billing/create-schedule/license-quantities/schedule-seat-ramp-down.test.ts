/**
 * Contract: ramping seats down through billing.create_schedule.
 *
 *  - Booking a later phase below today's assignments is accepted. When it
 *    starts, it bills the phase's seat count even if more seats were assigned
 *    after booking; everyone keeps their seat, the pool goes negative, and new
 *    assignments fail until enough are released.
 *  - The opening phase still rejects a seat count below today's assignments.
 *
 * Red (before): license_quantities was stripped, so the opening phase dropped
 * the customer's paid seats and rejected the booking outright.
 */
import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreateScheduleParamsV0Input,
	StartingAfterDuration,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectScheduledLicensePools } from "@tests/integration/licenses/utils/expectScheduledLicensePools";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	advanceToNextPhase,
	buildSeatPlans,
	seatPhaseTotal,
} from "./utils/scheduleSeatTestUtils";

const INCLUDED_SEATS = 1;

test.concurrent(
	`${chalk.yellowBright("schedule seat ramp-down: over-assigned phase bills its count and blocks new seats")}`,
	async () => {
		const customerId = "sched-seat-ramp-down";
		const { parent, seat } = buildSeatPlans({ prefix: "ssr-down" });

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 5, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 6 }],
				}),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});
		const { ctx, autumnV1, autumnV2_3, entities } = scenario;

		// Year 2 at 2 seats while 3 are assigned today: accepted, not rejected.
		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: parent.id }] },
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 1,
					},
					plans: [
						{
							plan_id: parent.id,
							license_quantities: [{ license_plan_id: seat.id, quantity: 2 }],
						},
					],
				},
			],
		});
		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: parent.id,
			licenses: [{ licensePlanId: seat.id, granted: 2, paidQuantity: 1 }],
		});

		// The team keeps growing after booking.
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [{ entity_id: entities[3].id }],
		});

		await advanceToNextPhase({ scenario });

		// Everyone keeps their seat; billing stays at the phase's 1 paid seat.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 2,
					usage: 4,
					remaining: -2,
					paid_quantity: 1,
				},
			],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: seatPhaseTotal({ paidSeats: 1 }),
		});

		await expectAutumnError({
			errMessage: "No available licenses for this plan",
			func: () =>
				autumnV2_3.licenses.attach({
					customer_id: customerId,
					plan_id: seat.id,
					entities: [{ entity_id: entities[4].id }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule seat ramp-down: opening phase below today's assignments rejects")}`,
	async () => {
		const customerId = "sched-seat-open-below";
		const { parent, seat } = buildSeatPlans({ prefix: "ssr-open" });

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 4 }],
				}),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1, 2],
				}),
			],
		});

		await expectAutumnError({
			errMessage: "Release licenses first",
			func: () =>
				autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
					customer_id: customerId,
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: parent.id,
									license_quantities: [
										{ license_plan_id: seat.id, quantity: 2 },
									],
								},
							],
						},
						{
							starting_after: {
								duration_type: StartingAfterDuration.Month,
								duration_count: 1,
							},
							plans: [{ plan_id: parent.id }],
						},
					],
				}),
		});
	},
);
