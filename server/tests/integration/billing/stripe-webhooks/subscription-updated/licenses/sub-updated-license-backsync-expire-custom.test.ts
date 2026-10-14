import { test } from "bun:test";
import {
	type ApiEntityV2,
	BillingInterval,
	CusProductStatus,
} from "@autumn/shared";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectSpareSeatRowsCorrect } from "@tests/integration/licenses/utils/expectSpareSeatRowsCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import {
	setupLicenseSubscription,
	updateSeatQuantity,
	waitForPoolCounters,
} from "./utils/subUpdatedLicenseBacksync";

test(`${chalk.yellowBright("sub.updated license back-sync: decrement to usage expires leftover unused seats")}`, async () => {
	const customerId = "sub-updated-license-backsync-surplus";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-surplus",
			quantity: 3,
		});

	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [1, 2, 3, 4].map((seatNumber) => ({
			entity_id: `surplus-seat-${seatNumber}`,
			name: `Seat ${seatNumber}`,
			feature_id: TestFeature.Users,
		})),
	});
	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: ["surplus-seat-4"],
	});
	const poolBefore = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom: false,
	});
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolBefore.link_id,
		count: 1,
		status: CusProductStatus.Active,
	});

	await updateSeatQuantity({ subscription, seatItem, quantity: 2 });

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 2,
		usage: 3,
	});

	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolBefore.link_id,
		count: 1,
		status: CusProductStatus.Expired,
	});
});

const CUSTOM_SEAT_PRICE = 120;

test(`${chalk.yellowBright("sub.updated license back-sync: quantity syncs on a customized license price keep definition and usage")}`, async () => {
	const customerId = "sub-updated-license-backsync-custom";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-cstm-upd",
			quantity: 3,
			customSeatPrice: { amount: CUSTOM_SEAT_PRICE, interval: "year" },
		});

	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: subscription.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Year },
	});

	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [1, 2, 3, 4].map((seatNumber) => ({
			entity_id: `cstm-seat-${seatNumber}`,
			name: `Seat ${seatNumber}`,
			feature_id: TestFeature.Users,
		})),
	});
	await autumnV2_3.track(
		{
			customer_id: customerId,
			entity_id: "cstm-seat-1",
			feature_id: TestFeature.Messages,
			value: 20,
		},
		{ timeout: 2000 },
	);
	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: ["cstm-seat-4"],
	});

	await updateSeatQuantity({ subscription, seatItem, quantity: 5 });
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 5,
		usage: 3,
	});
	const poolAfterIncrement = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Year },
	});

	await updateSeatQuantity({ subscription, seatItem, quantity: 1 });
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 1,
		usage: 3,
	});
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolAfterIncrement.link_id,
		count: 1,
		status: CusProductStatus.Expired,
	});

	const seatEntity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		"cstm-seat-1",
	);
	expectBalanceCorrect({
		customer: seatEntity,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 80,
		usage: 20,
	});
});
