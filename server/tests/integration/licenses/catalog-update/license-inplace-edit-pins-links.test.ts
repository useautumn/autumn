/**
 * TDD test: in-place item edit on a license plan whose parent link is
 * non-customized, non-propagated, and has no customer references.
 *
 * Red-failure mode (pre-fix): the item rewrite deleted the old entitlement
 * (nothing referenced it), then the license rebase pinned the old shape by
 * inserting license_entitlements pointing at the deleted row —
 * "license_entitlements_entitlement_fkey" FK violation, catalog.update 500s.
 *
 * Green-success criteria (post-fix): the old rows are pinned before the
 * rewrite, the update succeeds, and the non-propagated link keeps the old
 * item shape while the base plan carries the new one.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses: in-place item edit pins non-propagated catalog links")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const seatId = `license_pin_seat_${suffix}`;
		const parentId = `license_pin_parent_${suffix}`;

		const seatItem = (pooled: boolean) => ({
			feature_id: TestFeature.Messages,
			included: 25,
			...(pooled ? { pooled: true } : {}),
			reset: { interval: "month" },
		});

		const { autumnV2_2 } = await initScenario({
			customerId: `license-pin-${suffix}`,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: seatId,
					name: "Pin Seat",
					items: [seatItem(false)],
					price: { amount: 70, interval: "month" },
					licenses: [],
				},
				{
					plan_id: parentId,
					name: "Pin Parent",
					licenses: [{ license_plan_id: seatId, included: 0 }],
				},
			],
		});

		// Pre-fix: 500 "license_entitlements_entitlement_fkey" FK violation.
		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: seatId,
					name: "Pin Seat",
					items: [seatItem(true)],
					price: { amount: 70, interval: "month" },
					licenses: [],
				},
			],
		});

		const seat = await autumnV2_2.post("/plans.get", { plan_id: seatId });
		expect(seat.items.some((item: { pooled?: boolean }) => item.pooled)).toBe(
			true,
		);

		const parent = await autumnV2_2.post("/plans.get", { plan_id: parentId });
		expect(parent.licenses).toHaveLength(1);
		expect(parent.licenses[0]).toMatchObject({
			license_plan_id: seatId,
			version: 1,
			included: 0,
			prepaid_only: true,
		});
	},
);
