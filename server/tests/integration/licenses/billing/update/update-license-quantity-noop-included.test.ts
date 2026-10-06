// TDD contract (U3+U4): billing.update license_quantities converges the pool in place, seats stay anchored.
// Every quantity change bills a refund/charge pair per seat price (previous vs new paid picture).
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import {
	expectLicenseUpdatePreviewCorrect,
	expectQuantityLineItemPairCorrect,
} from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import chalk from "chalk";
import {
	ATTACHED_PAID_SEATS,
	ATTACHED_SEATS,
	DEV_SEAT_PRICE,
	INCLUDED_SEATS,
} from "./utils/updateLicenseQuantity";

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: same qty cancels the pair and skips billing")}`,
	async () => {
		const customerId = "license-update-quantity-noop";
		const { autumnV1, autumnV2_3, parent, devSeat, advancedTo } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-noop",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: ATTACHED_SEATS },
			],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		// Identical previous/new pictures cancel out entirely.
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal: ATTACHED_PAID_SEATS * DEV_SEAT_PRICE,
			newRecurringTotal: ATTACHED_PAID_SEATS * DEV_SEAT_PRICE,
			expectQuantityLineItemPair: true,
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
					granted: ATTACHED_SEATS,
					usage: 0,
					remaining: ATTACHED_SEATS,
					paid_quantity: ATTACHED_PAID_SEATS,
				},
			],
		});

		// No billing change -> the attach invoice stays the only one.
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: ATTACHED_PAID_SEATS * DEV_SEAT_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: included-only pool grows with a charge line only")}`,
	async () => {
		const customerId = "license-update-quantity-included-only";
		const includedSeats = 2;
		const { autumnV1, autumnV2_3, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-included",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats,
				attachedSeats: includedSeats,
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 4 }],
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		// A fully-included attach is free (no subscription yet), so the first
		// paid seats charge the full amount. Previous paid picture is empty ->
		// no $0 refund line, charge only.
		expect(preview.total).toEqual(2 * DEV_SEAT_PRICE);
		expectQuantityLineItemPairCorrect({
			preview,
			proratedOldTotal: 0,
			proratedNewTotal: 2 * DEV_SEAT_PRICE,
			newQuantity: 2,
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
					granted: 4,
					usage: 0,
					remaining: 4,
					paid_quantity: 2,
				},
			],
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: 2 * DEV_SEAT_PRICE,
		});
	},
);
