// TDD contract (U3+U4): billing.update license_quantities converges the pool in place, seats stay anchored.
// Every quantity change bills a refund/charge pair per seat price (previous vs new paid picture).
import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	ATTACHED_SEATS,
	DEV_SEAT_PRICE,
	INCLUDED_SEATS,
} from "./utils/updateLicenseQuantity";

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
