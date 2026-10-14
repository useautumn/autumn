/**
 * A feature switched to `combine: "max"` after customers already hold plans:
 * those earlier grants join the pool, with their usage, the next time a plan
 * change moves the feature.
 *
 * Contract:
 *   - Pro (1,000, 800 used) attached while the feature adds up, then the
 *     feature is set to max and a 5,000 plan is attached → one pool, granted
 *     5,000, 4,200 left: Pro's grant competes and its usage is kept.
 */

import { test } from "bun:test";
import {
	ApiVersion,
	type AttachParamsV1Input,
	FeatureCombine,
	FeatureType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const featureId = "combine_heal_messages";

const setFeatureCombine = async ({
	autumn,
	combine,
}: {
	autumn: AutumnInt;
	combine: FeatureCombine;
}) => {
	try {
		await autumn.post("/features.update", { feature_id: featureId, combine });
	} catch {
		await autumn.post("/features.create", {
			feature_id: featureId,
			name: "Combine heal messages",
			type: FeatureType.Metered,
			consumable: true,
			combine,
		});
	}
};

test(
	chalk.yellowBright(
		"combine max: grants attached before the switch join the pool with their usage",
	),
	async () => {
		const customerId = "combine-heal-existing-grants";
		const autumn = new AutumnInt({ version: ApiVersion.V2_1 });
		await setFeatureCombine({ autumn, combine: FeatureCombine.Sum });

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

		try {
			await setFeatureCombine({ autumn, combine: FeatureCombine.Max });
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
		} finally {
			await setFeatureCombine({ autumn, combine: FeatureCombine.Sum });
		}
	},
);
