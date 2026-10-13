// customer.subscription.updated back-sync for license seat quantities: Stripe quantity
// changes converge the single pool in place; entity seat usage survives every sync.

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

// ═══════════════════════════════════════════════════════════════════════════
// CASE 3b: decrement to exactly usage after release → remaining 0, spare expired
// ═══════════════════════════════════════════════════════════════════════════

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

	// paid 3 -> 2: granted 3 = 3 bound seats -> remaining 0, unused still 1.
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

// ═══════════════════════════════════════════════════════════════════════════
// CASE 4: customized ($120/yr) license base price — quantity syncs converge
// the pool, keep the custom definition, preserve usage, expire spares
// ═══════════════════════════════════════════════════════════════════════════

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

	// Baseline: pool anchored to the is_custom $120/yr definition.
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: subscription.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Year },
	});

	// 4 bound seats, usage tracked on one, one released back as a spare.
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

	// ── Increment 3 -> 5: pool converges, custom definition untouched ────
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

	// ── Overflow decrement 5 -> 1: remaining -1, spare expired ───────────
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

	// ── Usage on bound seats survived both syncs ─────────────────────────
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
