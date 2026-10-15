/**
 * Contract: feature_override on an AI credit system item.
 * - markups.model_markups merges per model with the catalog: the plan sets a
 *   model's markup, the catalog keeps its cost basis (input/output cost).
 * - credit_schema is rejected with a 400; only markups apply to AI credits.
 */

import { expect, test } from "bun:test";
import {
	ErrCode,
	type FeatureConfigOverride,
	ResetInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { deleteDbPlans } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const INPUT_TOKENS = 10_000;
const OUTPUT_TOKENS = 5_000;

// AiCreditsTiered's custom/override-model: $10/M in, $20/M out, 5% markup.
const catalogCostBasis = new Decimal(10)
	.mul(INPUT_TOKENS)
	.add(new Decimal(20).mul(OUTPUT_TOKENS))
	.div(1_000_000);

const withFeatureOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("track-tokens-feature-override-ai: model_markups take the plan's markup and the catalog's cost basis")}`,
	async () => {
		const aiCreditsItem = withFeatureOverride(
			items.free({
				featureId: TestFeature.AiCreditsTiered,
				includedUsage: 1000,
			}),
			{
				markups: {
					model_markups: {
						"custom/override-model": {
							markup: 20,
							input_cost: 1,
							output_cost: 1,
						},
					},
				},
			},
		);
		const prod = products.base({
			id: "ai-model-merge",
			items: [aiCreditsItem],
		});

		const { customerId, autumnV2 } = await initScenario({
			customerId: "track-tokens-override-model-merge",
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [s.attach({ productId: prod.id })],
		});

		const res: TrackResponseV2 = await autumnV2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCreditsTiered,
			model_id: "custom/override-model",
			input_tokens: INPUT_TOKENS,
			output_tokens: OUTPUT_TOKENS,
		});

		// Plan markup 20% on the catalog's $0.20 basis; the override's $1/M
		// costs would give 0.018, the catalog's 5% markup 0.21.
		expect(res.value).toBe(catalogCostBasis.mul(1.2).toNumber());
	},
);

test.concurrent(
	`${chalk.yellowBright("track-tokens-feature-override-ai: credit_schema on an AI credit system item is a 400")}`,
	async () => {
		const planId = uniqueTestId("ifo_ai_schema_plan");
		const { autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("ifo_ai_schema_cus"),
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidProductItem,
				errMessage: "credit_schema is not supported on AI credit system items",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: planId,
								items: [
									{
										feature_id: TestFeature.AiCredits,
										included: 100,
										reset: { interval: ResetInterval.Month },
										feature_override: {
											credit_schema: [
												{
													metered_feature_id: TestFeature.Action1,
													credit_cost: 1,
												},
											],
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
