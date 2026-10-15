/**
 * `combine: "max"` winners arriving and leaving: the pool's grant follows the
 * best competing plan while usage stays on the pool.
 *
 * Contract:
 *   - 800 used on Pro's 1,000, add a plan granting 5,000 → 4,200 left (PRD case 11).
 *   - The winner leaves → granted back to 1,000, usage kept; usage above the new
 *     grant leaves the balance negative until the next reset (decision 1).
 *   - A manual balance edit lands on the pool (PRD case 17).
 *   - Raising the competing grant in place (1,000 → 2,000, 300 used) leaves
 *     1,700: the old allowance is not counted as usage.
 */

import { test } from "bun:test";
import {
	type AttachParamsV1Input,
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const messages = (count: number) =>
	constructFeatureItem({
		featureId: TestFeature.CombineMaxMessages,
		includedUsage: count,
	});

test.concurrent(
	chalk.yellowBright(
		"combine max: a new winner keeps usage, its exit goes negative",
	),
	async () => {
		const customerId = "combine-max-winner-transitions";
		const pro = products.base({
			id: "combine-max-winner-pro",
			items: [messages(1000)],
		});
		const module = products.base({
			id: "combine-max-winner-module",
			isAddOn: true,
			items: [messages(5000)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, module] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.CombineMaxMessages, value: 800 }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 1000,
			remaining: 200,
			usage: 800,
		});

		// ── A new winner arrives ────────────────────────────────────────────
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: module.id,
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			granted: 5000,
			balance: 4200,
			competingContributions: [1000, 5000],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 5000,
			remaining: 4200,
			usage: 800,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.CombineMaxMessages,
			value: 3000,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 5000,
			remaining: 1200,
			usage: 3800,
		});
		// Usage reaches Postgres asynchronously; the cancel below must see it.
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			balance: 1200,
		});

		// ── The winner leaves: back to 1,000, usage kept, balance negative ──
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: module.id,
			cancel_action: "cancel_immediately",
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			granted: 1000,
			balance: -2800,
			competingContributions: [1000],
		});
	},
);

test.concurrent(
	chalk.yellowBright("combine max: a manual balance edit lands on the pool"),
	async () => {
		const customerId = "combine-max-manual-edit";
		const pro = products.base({
			id: "combine-max-edit-pro",
			items: [messages(1000)],
		});
		const module = products.base({
			id: "combine-max-edit-module",
			isAddOn: true,
			items: [messages(5000)],
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
			],
		});

		await autumnV2_3.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.CombineMaxMessages,
			usage: 1500,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMaxMessages,
			granted: 5000,
			remaining: 3500,
			usage: 1500,
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			granted: 5000,
			balance: 3500,
			competingContributions: [1000, 5000],
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine max: raising a competing grant in place keeps its usage, not its old allowance",
	),
	async () => {
		const customerId = "combine-max-edit-grant";
		const pro = products.base({
			id: "combine-max-edit-pro",
			items: [messages(1000)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.CombineMaxMessages, value: 300 }),
			],
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			granted: 1000,
			balance: 700,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: [
					{
						feature_id: TestFeature.CombineMaxMessages,
						included: 2000,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId: TestFeature.CombineMaxMessages,
			granted: 2000,
			balance: 1700,
			competingContributions: [2000],
		});
	},
);
