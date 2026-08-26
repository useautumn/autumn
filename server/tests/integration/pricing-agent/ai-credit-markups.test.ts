import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { deleteDbFeatures } from "../catalog-v2/utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("pricing agent: configuration sync preserves AI credit markups")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("pricing_agent_ai_credits");
		const modelMarkups = {
			"anthropic/claude-sonnet-4": { markup: 25 },
		};

		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.post("/configs/push", {
				features: [
					{
						id: featureId,
						name: "AI credits",
						type: FeatureType.AiCreditSystem,
						display: { singular: "credit", plural: "credits" },
						model_markups: modelMarkups,
						default_markup: 10,
						provider_markups: { anthropic: { markup: 15 } },
					},
				],
				products: [],
			});

			const feature = await FeatureService.get({
				db: ctx.db,
				id: featureId,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			expect(feature?.model_markups).toEqual(modelMarkups);
			expect(feature?.config).toMatchObject({
				default_markup: 10,
				provider_markups: { anthropic: { markup: 15 } },
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
	{ timeout: 120_000 },
);
