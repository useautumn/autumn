/**
 * atmn scenarios/features — change type on a feature with customers → blocked, error surfaced
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { FeatureType } from "@autumn/shared";
import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: changing a customered feature's type is refused, the type stays put")}`,
	async () => {
		const featureId = uniqueTestId("atmn_type_change");
		const planId = uniqueTestId("atmn_type_change_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer(),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${featureId}", name: "Type Change", type: "metered", consumable: true }),`,
				plans: `\n\t\tplan({ planId: "${planId}", name: "Type Change Plan", items: [{ featureId: "${featureId}", included: 100 }] }),`,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ featureId: "${featureId}", name: "Type Change", type: "boolean" }),`,
						plans: `\n\t\tplan({ planId: "${planId}", name: "Type Change Plan", items: [{ featureId: "${featureId}", included: 100 }] }),`,
					}),
				}),
			);

			await expect(scenario.push()).rejects.toThrow(
				/Cannot change type of feature .* because it has been attached to a customer before/,
			);

			const dbFeatures = await FeatureService.list({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			});
			expect(dbFeatures.find((feature) => feature.id === featureId)?.type).toBe(
				FeatureType.Metered,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
