/**
 * TDD contract (U3+U4): billing.update license_quantities converges the
 * pool in place — no plan restructure, seats stay anchored.
 *
 * Cases:
 *   - quantity 3 -> 5: paid_quantity 2 -> 4, delta invoices 2 x $20,
 *     Stripe seat item quantity follows.
 *   - quantity 3 -> 2: paid_quantity 2 -> 1, pool shrinks in place.
 *   - quantity below live assignments -> 400.
 *   - license_quantities for a plan without that license -> 400.
 */
import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";

const DEV_SEAT_PRICE = 20;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ATTACHED_PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 5 grows the pool and bills the delta")}`,
	async () => {
		const customerId = "license-update-quantity-inc";
		const { ctx, autumnV1, autumnV2_3, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-inc",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: parent.id,
					granted: 5,
					usage: 0,
					remaining: 5,
					paid_quantity: 4,
				},
			],
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: (4 - ATTACHED_PAID_SEATS) * DEV_SEAT_PRICE,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 2 shrinks the pool in place")}`,
	async () => {
		const customerId = "license-update-quantity-dec";
		const { ctx, autumnV2_3, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-dec",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 2 }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: parent.id,
					granted: 2,
					usage: 0,
					remaining: 2,
					paid_quantity: 1,
				},
			],
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: qty below live assignments rejects")}`,
	async () => {
		const customerId = "license-update-quantity-below-used";
		const { autumnV2_3, parent, devSeat, assignSeats } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-below",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		await assignSeats({ count: 2 });

		await expectAutumnError({
			errMessage: "Release licenses first",
			func: () =>
				autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [{ license_plan_id: devSeat.id, quantity: 1 }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: unknown license plan rejects")}`,
	async () => {
		const customerId = "license-update-quantity-unknown";
		const { autumnV2_3, parent } = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "lic-qty-unknown",
			seatPrice: DEV_SEAT_PRICE,
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});

		await expectAutumnError({
			errMessage: "no license pool",
			func: () =>
				autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [
						{ license_plan_id: "not-a-license", quantity: 2 },
					],
				}),
		});
	},
);
