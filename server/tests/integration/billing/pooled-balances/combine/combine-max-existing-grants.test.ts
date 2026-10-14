/**
 * A feature switched to `combine: "max"` / `"min"` after customers already hold
 * plans: those earlier grants compete, with their usage, the next time a plan
 * change moves the feature.
 *
 * Contract:
 *   - Pro (1,000, 800 used) attached while the feature adds up, then the
 *     feature is set to max and a 5,000 plan is attached → one pool, granted
 *     5,000, 4,200 left: Pro's grant competes and its usage is kept.
 *   - Same, with Pro's item explicitly pooled: its additive share converts to
 *     a competing one instead of stacking (5,000, not 6,000).
 *   - A never-pooled and a pooled grant converting in one transition both
 *     keep their usage (2,500 used across them → 2,500 left of 5,000).
 *   - Lifetime grants 48 + 24 + 12 attached while adding up, feature set to
 *     min, the 12 plan cancelled → the remaining grants compete: 24, not 72.
 */

import { test } from "bun:test";
import {
	ApiVersion,
	type AttachParamsV1Input,
	FeatureCombine,
	FeatureType,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_1 });

const createSumFeature = async ({
	prefix,
	consumable,
}: {
	prefix: string;
	consumable: boolean;
}) => {
	const featureId = uniqueTestId(prefix);
	await autumn.post("/features.create", {
		feature_id: featureId,
		name: prefix,
		type: FeatureType.Metered,
		consumable,
	});
	return featureId;
};

const setFeatureCombine = async ({
	featureId,
	combine,
}: {
	featureId: string;
	combine: FeatureCombine;
}) => {
	await autumn.post("/features.update", { feature_id: featureId, combine });
};

test.concurrent(
	chalk.yellowBright(
		"combine max: grants attached before the switch join the pool with their usage",
	),
	async () => {
		const customerId = "combine-heal-existing-grants";
		const featureId = await createSumFeature({
			prefix: "combine_heal_messages",
			consumable: true,
		});

		const pro = products.base({
			id: "combine-heal-pro",
			items: [constructFeatureItem({ featureId, includedUsage: 1000 })],
		});
		const module = products.base({
			id: "combine-heal-module",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 5000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, module] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId, value: 800 }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 1000,
			remaining: 200,
		});

		await setFeatureCombine({ featureId, combine: FeatureCombine.Max });
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: module.id,
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5000,
			balance: 4200,
			competingContributions: [1000, 5000],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 5000,
			remaining: 4200,
			usage: 800,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine max: an explicitly pooled grant from before the switch competes instead of adding",
	),
	async () => {
		const customerId = "combine-heal-pooled-grant";
		const featureId = await createSumFeature({
			prefix: "combine_heal_pooled",
			consumable: true,
		});

		const pro = products.base({
			id: "combine-heal-pooled-pro",
			items: [
				{
					...constructFeatureItem({ featureId, includedUsage: 1000 }),
					pooled: true,
				},
			],
		});
		const module = products.base({
			id: "combine-heal-pooled-module",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 5000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro, module] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId, value: 800 }),
			],
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 1000,
			balance: 200,
			addingContributions: [1000],
		});

		await setFeatureCombine({ featureId, combine: FeatureCombine.Max });
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: module.id,
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5000,
			balance: 4200,
			competingContributions: [1000, 5000],
			addingContributions: [],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 5000,
			remaining: 4200,
			usage: 800,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine min: cancelling a plan after the switch makes the remaining grants compete",
	),
	async () => {
		const customerId = "combine-heal-cancel";
		const featureId = await createSumFeature({
			prefix: "combine_heal_hours",
			consumable: false,
		});
		const hours = (amount: number) =>
			constructFeatureItem({
				featureId,
				includedUsage: amount,
				interval: null,
			});

		const base = products.base({
			id: "combine-heal-cancel-base",
			items: [hours(48)],
		});
		const run = products.base({
			id: "combine-heal-cancel-run",
			isAddOn: true,
			items: [hours(24)],
		});
		const trial = products.base({
			id: "combine-heal-cancel-trial",
			isAddOn: true,
			items: [hours(12)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, run, trial] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: run.id }),
				s.billing.attach({ productId: trial.id }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 84,
			remaining: 84,
		});

		await setFeatureCombine({ featureId, combine: FeatureCombine.Min });
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: trial.id,
			cancel_action: "cancel_immediately",
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 24,
			balance: 24,
			competingContributions: [48, 24],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 24,
			remaining: 24,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine max: converting pooled and unpooled grants together keeps both their usage",
	),
	async () => {
		const customerId = "combine-heal-mixed";
		const featureId = await createSumFeature({
			prefix: "combine_heal_mixed",
			consumable: true,
		});

		const base = products.base({
			id: "combine-heal-mixed-base",
			items: [
				{
					...constructFeatureItem({ featureId, includedUsage: 1000 }),
					pooled: true,
				},
			],
		});
		const unpooledAddOn = products.base({
			id: "combine-heal-mixed-unpooled",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 2000 })],
		});
		const module = products.base({
			id: "combine-heal-mixed-module",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 5000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, unpooledAddOn, module] }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: unpooledAddOn.id }),
				s.track({ featureId, value: 2500 }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 3000,
			remaining: 500,
		});

		await setFeatureCombine({ featureId, combine: FeatureCombine.Max });
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: module.id,
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5000,
			balance: 2500,
			competingContributions: [1000, 2000, 5000],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 5000,
			remaining: 2500,
			usage: 2500,
		});
	},
);
