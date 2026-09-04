/**
 * atmn scenarios/features — fake internalId (`fake_fake_id_123`) on a feature and a plan, push, pull → replaced by the real id
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const FAKE_INTERNAL_ID = "fake_fake_id_123";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: a fake internalId on a fresh feature and plan is replaced by the real one")}`,
	async () => {
		const featureId = uniqueTestId("atmn_fake_id_feat");
		const planId = uniqueTestId("atmn_fake_id_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${featureId}", name: "Fake", type: "boolean", internalId: "${FAKE_INTERNAL_ID}" }),`,
				plans: `\n\t\tplan({ planId: "${planId}", name: "Fake Plan", internalId: "${FAKE_INTERNAL_ID}" }),`,
			}),
		});

		try {
			await scenario.push();
			await scenario.pull();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string; internalId: string | null }>;
				plans: Array<{ id: string; internalId: string | null }>;
			};
			const realFeatureInternalId = catalog.features.find(
				(feature) => feature.id === featureId,
			)?.internalId;
			const realPlanInternalId = catalog.plans.find(
				(plan) => plan.id === planId,
			)?.internalId;
			expect(realFeatureInternalId).toBeTruthy();
			expect(realPlanInternalId).toBeTruthy();
			expect(realFeatureInternalId).not.toBe(FAKE_INTERNAL_ID);
			expect(realPlanInternalId).not.toBe(FAKE_INTERNAL_ID);

			const text = scenario.files().get("autumn.config.ts");
			expect(text).not.toContain(FAKE_INTERNAL_ID);
			expect(text).toContain(`internalId: ${JSON.stringify(realFeatureInternalId)}`);
			expect(text).toContain(`internalId: ${JSON.stringify(realPlanInternalId)}`);
		} finally {
			scenario.cleanup();
		}
	},
);
