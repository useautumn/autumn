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
import chalk from "chalk";
import { DEV_SEAT_PRICE } from "./utils/updateLicenseQuantity";

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: pooled grant follows purchased seats with nobody assigned")}`,
	async () => {
		const customerId = "license-update-quantity-pooled";
		const { autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-pooled",
				seatPrice: DEV_SEAT_PRICE,
				seatItems: [pooledMonthlyMessages({ includedUsage: 100 })],
				includedSeats: 0,
				attachedSeats: 3,
			});

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
			contributionCount: 0,
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
			contributionCount: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license-update-quantity: pooled grant shrinks with nobody assigned")}`,
	async () => {
		const customerId = "license-update-quantity-pooled-dec";
		const { autumnV2_3, ctx, parent, devSeat } =
			await setupLicenseUpdateScenario({
				customerId,
				idPrefix: "lic-qty-pooled-dec",
				seatPrice: DEV_SEAT_PRICE,
				seatItems: [pooledMonthlyMessages({ includedUsage: 100 })],
				includedSeats: 0,
				attachedSeats: 5,
			});

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
			seatCount: 5,
			contributionCount: 0,
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
			contributionCount: 0,
		});
	},
);
