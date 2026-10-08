// customer.subscription.updated back-sync for license seat quantities: Stripe quantity
// changes converge the single pool in place; entity seat usage survives every sync.

import { expect, test } from "bun:test";
import { type ApiEntityV2, CusProductStatus } from "@autumn/shared";
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

test(`${chalk.yellowBright("sub.updated license back-sync: current schedule quantity updates the pool")}`, async () => {
	const customerId = "sub-updated-license-backsync-schedule";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-schedule",
			quantity: 2,
		});

	const schedule = await ctx.stripeCli.subscriptionSchedules.create({
		from_subscription: subscription.id,
	});
	const currentPhase = schedule.phases[0]!;
	const currentEnd = currentPhase.end_date!;
	const nextEnd = currentEnd + 31 * 24 * 60 * 60;
	const phases = (quantity: number) => [
		{
			items: [{ price: seatItem.price.id, quantity }],
			start_date: currentPhase.start_date,
			end_date: currentEnd,
		},
		{
			items: [{ price: seatItem.price.id, quantity: 1 }],
			start_date: currentEnd,
			end_date: nextEnd,
		},
	];

	await ctx.stripeCli.subscriptionSchedules.update(schedule.id, {
		phases: phases(2),
	});
	await ctx.stripeCli.subscriptionSchedules.update(schedule.id, {
		phases: phases(3),
	});

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 3,
	});

	const updatedSchedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		schedule.id,
	);
	expect(
		updatedSchedule.phases.map((phase) => phase.items[0]?.quantity),
	).toEqual([3, 1]);
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 3: decrement below seats in use → remaining negative, spares expired
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: decrement below usage goes negative and expires spare seats")}`, async () => {
	const customerId = "sub-updated-license-backsync-overflow";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-ovf",
			quantity: 3,
		});

	// Fill the pool: 4 bound seats (granted 4 = included 1 + paid 3)...
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [1, 2, 3, 4].map((seatNumber) => ({
			entity_id: `ovf-seat-${seatNumber}`,
			name: `Seat ${seatNumber}`,
			feature_id: TestFeature.Users,
		})),
	});
	await autumnV2_3.track(
		{
			customer_id: customerId,
			entity_id: "ovf-seat-1",
			feature_id: TestFeature.Messages,
			value: 20,
		},
		{ timeout: 2000 },
	);
	// ...then release one, leaving a spare row awaiting reuse (used 3).
	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: ["ovf-seat-4"],
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

	await updateSeatQuantity({ subscription, seatItem, quantity: 1 });

	// paid 3 -> 1: granted 2 < 3 bound seats -> remaining -1 (no clamp).
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 1,
		usage: 3,
	});

	// The spare can never rebind while over-allocated — reconcile expired it.
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolBefore.link_id,
		count: 1,
		status: CusProductStatus.Expired,
	});

	// Bound seats were never re-provisioned — tracked usage survives.
	const seatEntity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		"ovf-seat-1",
	);
	expectBalanceCorrect({
		customer: seatEntity,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 80,
		usage: 20,
	});
});
