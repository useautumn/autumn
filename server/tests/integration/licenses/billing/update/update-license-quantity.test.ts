/**
 * TDD contract (U3+U4): billing.update license_quantities converges the
 * pool in place — no plan restructure, seats stay anchored.
 *
 * Line item contract: every quantity change bills as a refund/charge pair
 * per seat price — one line for the previous billable (paid) picture, one
 * for the new — mirroring feature_quantities updates. A pair that nets to
 * zero is dropped by finalize; a zero-quantity side emits no line.
 *
 * Cases:
 *   - quantity 3 -> 5: paid_quantity 2 -> 4, pair -$40/+$80 prorated,
 *     delta invoices 2 x $20, Stripe seat item quantity follows.
 *   - quantity 3 -> 2: paid_quantity 2 -> 1, pair -$40/+$20 prorated.
 *   - quantity 3 -> 5 with all seats assigned (0 included): pair
 *     -$60/+$100 — assigned-seat portions must NOT collapse into a
 *     delta-only line.
 *   - quantity 3 -> 5 partially assigned (1 included): pair -$40/+$80.
 *   - same quantity: pair cancels -> no line items, no new invoice.
 *   - included-only pool (0 paid) grown: charge line only, no $0 refund.
 *   - quantity below live assignments -> 400.
 *   - license_quantities for a plan without that license -> 400.
 */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import {
	expectLicenseUpdatePreviewCorrect,
	expectQuantityLineItemPairCorrect,
} from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
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
	`${chalk.yellowBright("license-update-quantity: qty 3 -> 2 shrinks the pool in place")}`,
	async () => {
		const customerId = "license-update-quantity-dec";
		const { ctx, autumnV2_3, parent, devSeat, advancedTo } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-dec",
				seatPrice: DEV_SEAT_PRICE,
				includedSeats: INCLUDED_SEATS,
				attachedSeats: ATTACHED_SEATS,
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 2 }],
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
			newRecurringTotal: DEV_SEAT_PRICE,
			expectQuantityLineItemPair: { oldQuantity: 2, newQuantity: 1 },
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
