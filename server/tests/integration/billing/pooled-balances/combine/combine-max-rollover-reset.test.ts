/**
 * `combine: "max"` across a reset: the refill uses the winning grant, and only
 * the winner's unused amount can roll over.
 *
 * Contract:
 *   - 1,000 + 5,000 both rolling over, 4,000 used at reset → 1,000 rolls over,
 *     not 2,000 (PRD case 10).
 *   - The reset refills the pool to the best grant (5,000), not the sum.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV5,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expirePooledBalanceForReset } from "../utils/expirePooledBalanceForReset.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const featureId = TestFeature.CombineMaxMessages;
const rolloverConfig = {
	max: null,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const rollingMessages = (amount: number) =>
	constructFeatureItem({ featureId, includedUsage: amount, rolloverConfig });

test.concurrent(
	chalk.yellowBright(
		"combine max: reset refills the winner, only its unused rolls over",
	),
	async () => {
		const customerId = "combine-max-rollover-reset";
		const pro = products.base({
			id: "combine-max-rollover-pro",
			items: [rollingMessages(1000)],
		});
		const module = products.base({
			id: "combine-max-rollover-module",
			isAddOn: true,
			items: [rollingMessages(5000)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, module] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: module.id }),
				s.track({ featureId, value: 4000 }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 5000,
			remaining: 1000,
		});
		// Usage reaches Postgres asynchronously; the reset below must see it.
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			balance: 1000,
		});

		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});
		await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5000,
			balance: 5000,
			competingContributions: [1000, 5000],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 6000,
			remaining: 6000,
			usage: 0,
			rollovers: [{ balance: 1000 }],
		});
	},
);
