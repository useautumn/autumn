import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

const BASE_PRICE = 50;
const UPDATED_BASE_PRICE = 60;
const DEV_SEAT_PRICE = 20;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;

test.concurrent(
	`${chalk.yellowBright("license-update: base price patch keeps stripe seat items and pool intact")}`,
	async () => {
		const customerId = "license-update-preserves-items";
		const {
			ctx,
			autumnV1,
			autumnV2_3,
			parent,
			devSeat,
			assignSeats,
			advancedTo,
		} = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "preserve",
			parentItems: [
				items.monthlyPrice({ price: BASE_PRICE }),
				items.dashboard(),
			],
			seatPrice: DEV_SEAT_PRICE,
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});

		await assignSeats({ count: ASSIGNED_SEATS });

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: UPDATED_BASE_PRICE }),
			},
		};
		const preview =
			await autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo,
			oldRecurringTotal: BASE_PRICE + PAID_SEATS * DEV_SEAT_PRICE,
			newRecurringTotal: UPDATED_BASE_PRICE + PAID_SEATS * DEV_SEAT_PRICE,
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
					usage: ASSIGNED_SEATS,
					remaining: ATTACHED_SEATS - ASSIGNED_SEATS,
					paid_quantity: PAID_SEATS,
				},
			],
		});

		await expectAssignmentsAnchoredToParent({
			ctx,
			customerId,
			parentPlanId: parent.id,
			count: ASSIGNED_SEATS,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: UPDATED_BASE_PRICE - BASE_PRICE,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
