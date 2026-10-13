// TDD contract (U3+U4): billing.update license_quantities converges the pool in place, seats stay anchored.
// Every quantity change bills a refund/charge pair per seat price (previous vs new paid picture).
import { test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import {
	expectLicensePooledGrant,
	pooledMonthlyMessages,
	seatLinkId,
} from "@tests/integration/licenses/pooled-balances/utils/licensePooledBalanceTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import {
	ATTACHED_PAID_SEATS,
	ATTACHED_SEATS,
	DEV_SEAT_PRICE,
	INCLUDED_SEATS,
} from "./utils/updateLicenseQuantity";

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: pooled shrink with usage keeps remaining usage")}`,
	async () => {
		const customerId = "license-update-quantity-pooled-usage";
		const { autumnV2_3, ctx, parent, devSeat, assignSeats } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-pooled-usage",
				seatPrice: DEV_SEAT_PRICE,
				seatItems: [pooledMonthlyMessages({ includedUsage: 100 })],
				includedSeats: 0,
				attachedSeats: 5,
			});

		await assignSeats({ count: 1 });
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: devSeat.id,
		});
		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 50,
			},
			{ timeout: 2000 },
		);
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 100,
			seatCount: 5,
			contributionCount: 1,
			usage: 50,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 3 }],
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 100,
			seatCount: 3,
			contributionCount: 1,
			usage: 50,
		});
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
