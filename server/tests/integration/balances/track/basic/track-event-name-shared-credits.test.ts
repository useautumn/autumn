/**
 * An event that fans out to two features paid by one credit system answers with the credit system's balance after
 * both deductions, on both balance routes.
 *
 * Red (before): the balance worker route answered `balance` from the first feature's reply (99), before the
 *   second feature's deduction, while its own `balances` said 97.
 * Green (after): `balance` and `balances` both read 97.
 */

import { expect, test } from "bun:test";
import { ApiVersion, type TrackResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("track-event-name-shared-credits1: balance is the shared credit system after every deduction")}`,
	async () => {
		const plan = products.base({
			id: "shared-credits",
			items: [
				items.free({
					featureId: TestFeature.SharedCredits,
					includedUsage: 100,
				}),
			],
		});
		const customerId = "track-event-name-shared-credits1";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// SharedAction1 costs 1 credit, SharedAction2 costs 2: 100 → 97.
		const response: TrackResponseV3 = await autumnV2_3.track({
			customer_id: customerId,
			event_name: "shared-credit-event",
			value: 1,
		});

		expect(response.balance?.feature_id).toBe(TestFeature.SharedCredits);
		expect(response.balance?.remaining).toBe(97);
	},
);
