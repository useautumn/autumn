/** Red: a resetting plan balance drained before a loose grant that expires before the plan resets.
 * Green: whichever balance is lost first, by reset or expiry, is consumed first. */

import { expect, test } from "bun:test";
import {
	type CheckResponseV2,
	ms,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-expiry-before-reset: a grant expiring before the plan resets is consumed first")}`,
	async () => {
		const plan = products.base({
			id: "monthly-credits",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});
		const { customerId, autumnV2, autumnV2_2 } = await initScenario({
			customerId: "track-expiry-before-reset",
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
			balance_id: "expires-before-reset",
			expires_at: Date.now() + ms.days(7),
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 60,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});
		const balances = Object.fromEntries(
			check.balance?.breakdown?.map((balance) => [
				balance.plan_id ?? balance.id,
				balance.current_balance,
			]) ?? [],
		);

		expect(balances).toMatchObject({
			"expires-before-reset": 40,
			[plan.id]: 100,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-expiry-before-reset: a plan that rolls over outlasts a grant expiring after its reset")}`,
	async () => {
		const plan = products.base({
			id: "monthly-credits-rollover",
			items: [
				items.monthlyCredits({
					includedUsage: 100,
					rolloverConfig: {
						max: null,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					},
				}),
			],
		});
		const { customerId, autumnV2, autumnV2_2 } = await initScenario({
			customerId: "track-expiry-after-reset-rollover",
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
			balance_id: "expires-after-reset",
			expires_at: Date.now() + ms.days(45),
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 60,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});
		const balances = Object.fromEntries(
			check.balance?.breakdown?.map((balance) => [
				balance.plan_id ?? balance.id,
				balance.current_balance,
			]) ?? [],
		);

		expect(balances).toMatchObject({
			"expires-after-reset": 40,
			[plan.id]: 100,
		});
	},
);
