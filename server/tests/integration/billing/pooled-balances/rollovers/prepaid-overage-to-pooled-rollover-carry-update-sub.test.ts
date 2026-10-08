/**
 * TDD contract: a prepaid rollover survives a move onto a POOLED item whose rollover signature does
 * not match the one that minted it (carried amount is capped by the pooled cusEnt's rollover rules).
 */

import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import chalk from "chalk";
import {
	customization,
	expectRolloverCarriedToPool,
	setupPrepaidOverageCredits,
} from "./utils/prepaidOverageRolloverCarry.js";

test(
	chalk.yellowBright(
		"pooled rollover carry (update subscription): a prepaid rollover carries onto a pooled included item despite the signature mismatch",
	),
	async () => {
		const scenario = await setupPrepaidOverageCredits({
			customerId: "prepaid-overage-to-pooled-update-sub",
		});

		await scenario.autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			{
				customer_id: scenario.customerId,
				plan_id: scenario.plan.id,
				customize: customization,
			},
		);

		await expectRolloverCarriedToPool({ scenario });
	},
);
