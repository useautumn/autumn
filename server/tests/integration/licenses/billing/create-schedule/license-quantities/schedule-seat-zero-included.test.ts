/**
 * Contract: a schedule phase whose plan includes no seats still owns a seat
 * pool when it pays for none, so assigned seats have somewhere to stay.
 *
 *  - Later phase, count omitted (0 paid, 0 included): when it starts, every
 *    assigned seat stays on the new pool and remaining goes negative.
 *  - Opening phase, explicit 0 while seats are assigned: rejected.
 *
 * Red (before): a 0-seat phase created no pool, so the opening phase silently
 * dropped the assigned seats' pool and a later phase stranded them.
 */
import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreateScheduleParamsV0Input,
	StartingAfterDuration,
} from "@autumn/shared";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectScheduledLicensePools } from "@tests/integration/licenses/utils/expectScheduledLicensePools";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	advanceToNextPhase,
	buildSeatPlans,
} from "./utils/scheduleSeatTestUtils";

const ASSIGNED_SEATS = 2;

test.concurrent(
	`${chalk.yellowBright("schedule zero-seat plan: omitted later phase keeps assigned seats on an empty pool")}`,
	async () => {
		const customerId = "sched-seat-zero-later";
		const { parent, seat } = buildSeatPlans({ prefix: "ssz-later" });

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
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 3 }],
				}),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1],
				}),
			],
		});
		const { ctx, autumnV2_3 } = scenario;

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: parent.id }] },
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 1,
					},
					plans: [{ plan_id: parent.id }],
				},
			],
		});
		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: parent.id,
			licenses: [{ licensePlanId: seat.id, granted: 0, paidQuantity: 0 }],
		});

		await advanceToNextPhase({ scenario });

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 0,
					usage: ASSIGNED_SEATS,
					remaining: -ASSIGNED_SEATS,
					paid_quantity: 0,
				},
			],
		});
		await expectAssignmentsAnchoredToParent({
			ctx,
			customerId,
			parentPlanId: parent.id,
			count: ASSIGNED_SEATS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule zero-seat plan: opening phase at 0 seats with assignments rejects")}`,
	async () => {
		const customerId = "sched-seat-zero-open";
		const { parent, seat } = buildSeatPlans({ prefix: "ssz-open" });

		const { autumnV2_3 } = await initScenario({
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
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 3 }],
				}),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1],
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
										{ license_plan_id: seat.id, quantity: 0 },
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
