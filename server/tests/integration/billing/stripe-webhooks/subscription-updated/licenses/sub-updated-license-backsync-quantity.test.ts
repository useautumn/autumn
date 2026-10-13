// customer.subscription.updated back-sync for license seat quantities: Stripe quantity
// changes converge the single pool in place; entity seat usage survives every sync.

import { test } from "bun:test";
import chalk from "chalk";
import {
	setupLicenseSubscription,
	updateSeatQuantity,
	waitForPoolCounters,
} from "./utils/subUpdatedLicenseBacksync";

// ═══════════════════════════════════════════════════════════════════════════
// CASE 1: quantity 3 -> 4 increments the pool
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: qty 3 -> 4 increments pool paid_quantity")}`, async () => {
	const customerId = "sub-updated-license-backsync-inc";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-inc",
			quantity: 3,
		});

	await updateSeatQuantity({ subscription, seatItem, quantity: 4 });

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 4,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2: quantity 3 -> 2 decrements the pool
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: qty 3 -> 2 decrements pool paid_quantity")}`, async () => {
	const customerId = "sub-updated-license-backsync-dec";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-dec",
			quantity: 3,
		});

	await updateSeatQuantity({ subscription, seatItem, quantity: 2 });

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 2,
	});
});
