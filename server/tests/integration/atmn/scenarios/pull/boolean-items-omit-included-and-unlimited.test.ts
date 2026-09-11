import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
	wireOfConfig,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"boolean items omit included and unlimited while metered zero remains stable",
	async () => {
		const booleanFeatureId = uniqueTestId("atmn_boolean");
		const meteredFeatureId = uniqueTestId("atmn_metered");
		const planId = uniqueTestId("atmn_plan");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: { raw: atmnConfigSource({ body: "{}" }) },
		});

		try {
			await scenario.client.update({
				features: [
					{
						feature_id: booleanFeatureId,
						name: "Boolean Feature",
						type: "boolean",
					},
					{
						feature_id: meteredFeatureId,
						name: "Metered Feature",
						type: "metered",
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Plan",
						items: [
							{
								feature_id: booleanFeatureId,
								included: 0,
								unlimited: false,
							},
							{
								feature_id: meteredFeatureId,
								included: 0,
								unlimited: false,
							},
						],
					},
				],
				skip_deletions: false,
				migration: { draft: true },
			});

			await scenario.pull();
			const firstFiles = scenario.files();
			const fixtureText = firstFiles.get("autumn.config.ts") ?? "";
			expect(fixtureText).toContain(`				{
					featureId: "${booleanFeatureId}",
				},`);
			expect(fixtureText).toContain(`					featureId: "${meteredFeatureId}",
					included: 0,`);
			expect(fixtureText).not.toContain("unlimited: false");

			const wire = wireOfConfig({ configPath: scenario.configPath }) as {
				plans?: Array<{
					items?: Array<Record<string, unknown>>;
				}>;
			};
			const items = wire.plans?.[0]?.items;
			expect(items?.[0]).toEqual({ feature_id: booleanFeatureId });
			expect(items?.[1]).toEqual(
				expect.objectContaining({
					feature_id: meteredFeatureId,
					included: 0,
				}),
			);
			expect(items?.[1]).not.toHaveProperty("unlimited");

			await scenario.pull();
			expect([...scenario.files().entries()]).toEqual([
				...firstFiles.entries(),
			]);
			const dryRun = await scenario.push({ dryRun: true });
			expect(dryRun.output).toContain("No changes");
		} finally {
			scenario.cleanup();
		}
	},
);
