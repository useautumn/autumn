// TDD contract (U3+U4): billing.update license_quantities converges the pool in place, seats stay anchored.
// Every quantity change bills a refund/charge pair per seat price (previous vs new paid picture).
import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import {
	expectLicensePooledGrant,
	pooledMonthlyMessages,
	seatLinkId,
} from "@tests/integration/licenses/pooled-balances/utils/licensePooledBalanceTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { DEV_SEAT_PRICE } from "./utils/updateLicenseQuantity";

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: pooled grant grows while two seats are assigned")}`,
	async () => {
		const customerId = "license-update-quantity-pooled-assigned";
		const { autumnV2_3, ctx, parent, devSeat, assignSeats } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-pooled-assigned",
				seatPrice: DEV_SEAT_PRICE,
				seatItems: [pooledMonthlyMessages({ includedUsage: 100 })],
				includedSeats: 0,
				attachedSeats: 3,
			});

		await assignSeats({ count: 2 });
		const customerLicenseLinkId = await seatLinkId({
			db: ctx.db,
			customerId,
			licenseProductId: devSeat.id,
		});
		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 100,
			seatCount: 3,
			contributionCount: 2,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		});

		await expectLicensePooledGrant({
			autumn: autumnV2_3,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 100,
			seatCount: 5,
			contributionCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: pooled grow 3 → 5 keeps usage")}`,
	async () => {
		const customerId = "license-update-quantity-pooled-grow-usage";
		const { autumnV2_3, ctx, parent, devSeat, assignSeats } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-pooled-grow-usage",
				seatPrice: DEV_SEAT_PRICE,
				seatItems: [pooledMonthlyMessages({ includedUsage: 100 })],
				includedSeats: 0,
				attachedSeats: 3,
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
			seatCount: 3,
			contributionCount: 1,
			usage: 50,
		});

		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		});

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
	},
);
