import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: a config redefining a feature and plan already in Autumn gets their ids on pull")}`,
	async () => {
		const featureId = uniqueTestId("atmn_already_feat");
		const planId = uniqueTestId("atmn_already_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({}),
		});

		try {
			await scenario.client.update({
				features: [
					{
						feature_id: featureId,
						name: "Already There",
						type: FeatureType.Boolean,
					},
				],
				plans: [{ plan_id: planId, name: "Already Plan" }],
			} as Record<string, unknown>);

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ featureId: "${featureId}", name: "Already There", type: "boolean" }),`,
						plans: `\n\t\tplan({ active: true, planId: "${planId}", name: "Already Plan", versionSlug: "v1", }),`,
					}),
				}),
			);

			const pulled = await scenario.pull();
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);

			const text = scenario.files().get("autumn.config.ts") ?? "";
			const featureBlock = text.match(/feature\(\{[\s\S]*?\}\)/)?.[0];
			const planBlock = text.match(/plan\(\{[\s\S]*?\}\)/)?.[0];
			const featureInternalId = featureBlock?.match(
				/internalId: "([^"]+)"/,
			)?.[1];
			const planInternalId = planBlock?.match(/internalId: "([^"]+)"/)?.[1];
			expect(featureInternalId).toBeTruthy();
			expect(planInternalId).toBeTruthy();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string; internalId: string | null }>;
				plans: Array<{ id: string; internalId: string | null }>;
			};
			expect(featureInternalId).toBe(
				catalog.features.find((feature) => feature.id === featureId)
					?.internalId ?? undefined,
			);
			expect(planInternalId).toBe(
				catalog.plans.find((plan) => plan.id === planId)?.internalId ??
					undefined,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
