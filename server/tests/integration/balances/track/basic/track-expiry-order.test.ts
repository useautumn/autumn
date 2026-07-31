/** Red: equal-interval balances followed creation order, consuming the later-expiring batch first.
 * Green: the soonest-expiring balance is consumed first. */

import { expect, test } from "bun:test";
import { type CheckResponseV2, ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-expiry-order: equal intervals deduct the soonest-expiring balance first")}`,
	async () => {
		const customerId = "track-expiry-order";
		const { autumnV2, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
			balance_id: "later-expiry",
			expires_at: Date.now() + ms.days(365),
		});
		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
			balance_id: "sooner-expiry",
			expires_at: Date.now() + ms.days(30),
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
				balance.id,
				balance.current_balance,
			]) ?? [],
		);

		expect(balances).toMatchObject({
			"sooner-expiry": 40,
			"later-expiry": 100,
		});
	},
);
