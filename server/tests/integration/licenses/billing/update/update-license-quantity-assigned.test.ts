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
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 5 with all seats assigned bills previous vs new picture")}`,
	async () => {
		const customerId = "license-update-quantity-assigned";
		const attachedSeats = 3;
		const {
			ctx,
			autumnV1,
			autumnV2_3,
			parent,
			devSeat,
			advancedTo,
			assignSeats,
		} = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "lic-qty-assigned",
			seatPrice: DEV_SEAT_PRICE,
			includedSeats: 0,
			attachedSeats,
		});
		await assignSeats({ count: attachedSeats });

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		// Assigned-seat portions must not collapse into a delta-only line:
		// the pair bills the full previous (3 paid) vs new (5 paid) picture.
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal: attachedSeats * DEV_SEAT_PRICE,
			newRecurringTotal: 5 * DEV_SEAT_PRICE,
			expectQuantityLineItemPair: { oldQuantity: 3, newQuantity: 5 },
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
					usage: attachedSeats,
					remaining: 5 - attachedSeats,
					paid_quantity: 5,
				},
			],
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: (5 - attachedSeats) * DEV_SEAT_PRICE,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 5 partially assigned keeps the full pair")}`,
	async () => {
		const customerId = "license-update-quantity-partial-assigned";
		const { autumnV2_3, parent, devSeat, advancedTo, assignSeats } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-partial",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});
		await assignSeats({ count: 2 });

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
					usage: 2,
					remaining: 3,
					paid_quantity: 4,
				},
			],
		});
	},
);
