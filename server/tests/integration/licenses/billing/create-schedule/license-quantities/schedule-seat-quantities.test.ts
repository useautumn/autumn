/**
 * Contract: billing.create_schedule accepts `license_quantities` on each phase
 * plan, with attach's meaning (total seats, inclusive of the included count).
 *
 *  - Ramp-up: each phase bills its own paid seats; the later phase takes over
 *    at its start without another API call, and the preview's next cycle
 *    already prices it.
 *  - Omission: the opening phase keeps the customer's current seats (attach
 *    parity); a later phase gets included seats only (feature_quantities parity).
 *  - A license the phase plan doesn't offer is rejected.
 *
 * Red (before): the phase schema stripped license_quantities, so scheduled
 * pools were always included-only and the opening phase dropped paid seats.
 */
import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreateScheduleParamsV0Input,
	StartingAfterDuration,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectScheduledLicensePools } from "@tests/integration/licenses/utils/expectScheduledLicensePools";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	advanceToNextPhase,
	buildSeatPlans,
	previewCreateSchedule,
	seatPhaseTotal,
} from "./utils/scheduleSeatTestUtils";

const INCLUDED_SEATS = 2;

test.concurrent(
	`${chalk.yellowBright("schedule seat quantities: ramp-up bills each phase's paid seats")}`,
	async () => {
		const customerId = "sched-seat-ramp-up";
		const { parent, seat } = buildSeatPlans({ prefix: "ssq-up" });

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});
		const { ctx, autumnV1, autumnV2_3, advancedTo } = scenario;

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: parent.id,
							license_quantities: [{ license_plan_id: seat.id, quantity: 5 }],
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
							license_quantities: [{ license_plan_id: seat.id, quantity: 8 }],
						},
					],
				},
			],
		};

		// Preview prices the opening phase now and the ramped phase next cycle.
		const preview = await previewCreateSchedule({ autumnV1, params });
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(advancedTo, 1).getTime(),
			total: seatPhaseTotal({ paidSeats: 6 }),
		});

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>(
			params,
		);

		// Phase 1 is live with 3 paid seats; phase 2 waits with 6.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 5,
					paid_quantity: 3,
				},
			],
		});
		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: parent.id,
			licenses: [{ licensePlanId: seat.id, granted: 8, paidQuantity: 6 }],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: seatPhaseTotal({ paidSeats: 3 }),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// Phase 2 takes over on its own and bills 6 paid seats.
		await advanceToNextPhase({ scenario });

		const rampedCustomer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer: rampedCustomer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 8,
					paid_quantity: 6,
				},
			],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: seatPhaseTotal({ paidSeats: 6 }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule seat quantities: omitted counts keep current seats now, included-only later")}`,
	async () => {
		const customerId = "sched-seat-omitted";
		const { parent, seat } = buildSeatPlans({ prefix: "ssq-omit" });

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
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
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 5 }],
				}),
			],
		});

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

		// Opening phase: attach parity — the 3 paid seats carry over.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: seat.id,
					parent_plan_id: parent.id,
					granted: 5,
					paid_quantity: 3,
				},
			],
		});

		// Later phase: feature_quantities parity — included seats only.
		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: parent.id,
			licenses: [
				{ licensePlanId: seat.id, granted: INCLUDED_SEATS, paidQuantity: 0 },
			],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("schedule seat quantities: a license the phase plan doesn't offer rejects")}`,
	async () => {
		const customerId = "sched-seat-unknown";
		const { parent, seat } = buildSeatPlans({ prefix: "ssq-unk" });
		const otherSeat = products.base({
			id: "ssq-unk-other-seat",
			group: "ssq-unk-other-seat",
			items: [items.monthlyPrice({ price: 10 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [parent, seat, otherSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		await expectAutumnError({
			errMessage: "does not offer license",
			func: () =>
				autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
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
									license_quantities: [
										{ license_plan_id: otherSeat.id, quantity: 3 },
									],
								},
							],
						},
					],
				}),
		});
	},
);
