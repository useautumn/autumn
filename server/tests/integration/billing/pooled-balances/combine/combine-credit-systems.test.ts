/**
 * Credit systems under `combine: "max"`: only grants charged at the same rates
 * compete; a plan with its own credit rates keeps a pool of its own.
 *
 * Contract:
 *   - Same credit system, same rates on both plans → max applies (PRD case 15).
 *   - A plan overriding the credit rates → kept separate, added up (PRD case 16).
 */

import { test } from "bun:test";
import type { AttachParamsV1Input, ProductItem } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const featureId = TestFeature.CombineMaxCredits;

const credits = (amount: number) =>
	constructFeatureItem({ featureId, includedUsage: amount });

const creditsAtRate = ({
	amount,
	rate,
}: {
	amount: number;
	rate: number;
}): ProductItem => ({
	...credits(amount),
	config: {
		feature_override: {
			schema: [
				{
					metered_feature_id: TestFeature.CombineAction,
					credit_amount: rate,
				},
			],
		},
	},
});

test.concurrent(
	chalk.yellowBright("combine max credits: same rates compete"),
	async () => {
		const customerId = "combine-credits-same-rates";
		const planA = products.base({
			id: "combine-credits-same-a",
			items: [credits(1000)],
		});
		const planB = products.base({
			id: "combine-credits-same-b",
			isAddOn: true,
			items: [credits(5000)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id }),
			],
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5000,
			competingContributions: [1000, 5000],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 5000,
			remaining: 5000,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine max credits: different rates stay separate and add up",
	),
	async () => {
		const customerId = "combine-credits-different-rates";
		const planA = products.base({
			id: "combine-credits-diff-a",
			items: [credits(1000)],
		});
		const planB = products.base({
			id: "combine-credits-diff-b",
			isAddOn: true,
			items: [creditsAtRate({ amount: 5000, rate: 2 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [s.billing.attach({ productId: planA.id })],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: planB.id,
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			poolCount: 2,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 6000,
			remaining: 6000,
		});
	},
);
