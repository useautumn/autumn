/**
 * atmn scenarios/features — feature and plan already in Autumn, redefined in the CLI without ids, pull → ids written in
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

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

		// No `features`/`plans` key: this scenario's rows come from a direct
		// catalogV2.update call, the way a dashboard-created row would.
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

			// The user writes a config redefining the same public ids fresh,
			// unaware they already exist — no internalId anywhere.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ featureId: "${featureId}", name: "Already There", type: "boolean" }),`,
						plans: `\n\t\tplan({ planId: "${planId}", name: "Already Plan" }),`,
					}),
				}),
			);

			const pulled = await scenario.pull();
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);

			const text = scenario.files().get("autumn.config.ts");
			const featureMatch = text?.match(
				new RegExp(`feature\\(\\{ internalId: "([^"]+)", featureId: "${featureId}"`),
			);
			const planMatch = text?.match(
				new RegExp(`plan\\(\\{ internalId: "([^"]+)", planId: "${planId}"`),
			);
			expect(featureMatch?.[1]).toBeTruthy();
			expect(planMatch?.[1]).toBeTruthy();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string; internalId: string | null }>;
				plans: Array<{ id: string; internalId: string | null }>;
			};
			expect(featureMatch?.[1]).toBe(
				catalog.features.find((feature) => feature.id === featureId)
					?.internalId ?? undefined,
			);
			expect(planMatch?.[1]).toBe(
				catalog.plans.find((plan) => plan.id === planId)?.internalId ??
					undefined,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
