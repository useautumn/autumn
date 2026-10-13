// TDD contract (U3+U4): billing.update license_quantities converges the pool in place, seats stay anchored.
// Every quantity change bills a refund/charge pair per seat price (previous vs new paid picture).
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
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import chalk from "chalk";
import {
	ATTACHED_PAID_SEATS,
	ATTACHED_SEATS,
	DEV_SEAT_PRICE,
	INCLUDED_SEATS,
} from "./utils/updateLicenseQuantity";

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 5 grows the pool and bills the delta")}`,
	async () => {
		const customerId = "license-update-quantity-inc";
		const { ctx, autumnV1, autumnV2_3, parent, devSeat, advancedTo } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-inc",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal: ATTACHED_PAID_SEATS * DEV_SEAT_PRICE,
			newRecurringTotal: 4 * DEV_SEAT_PRICE,
			expectQuantityLineItemPair: { oldQuantity: 2, newQuantity: 4 },
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

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
	`${chalk.yellowBright("license-update-quantity: sequential 5 -> 7 -> 9 changes credit each prior charge once")}`,
	async () => {
		const customerId = "license-update-quantity-sequential";
		const { autumnV2_3, parent, devSeat, advancedTo } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-sequential",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: 0,
				attachedSeats: 5,
				// Two updates take long enough on a busy runner for wall-clock proration to drift past the cent tolerance.
				testClock: true,
			});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 7 }],
		});

		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: customerId,
					plan_id: parent.id,
					license_quantities: [{ license_plan_id: devSeat.id, quantity: 9 }],
				},
			);

		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal: 7 * DEV_SEAT_PRICE,
			newRecurringTotal: 9 * DEV_SEAT_PRICE,
			expectQuantityLineItemPair: { oldQuantity: 7, newQuantity: 9 },
		});
	},
);
