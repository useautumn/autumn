/**
 * atmn scenarios/features — rename featureId without internalId → create + old one archived (what "created already archived" was)
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

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
	`${chalk.yellowBright("atmn scenarios/features: renaming featureId without internalId is a create; the old id archives if it's still referenced")}`,
	async () => {
		const oldId = uniqueTestId("atmn_rn_bare_old");
		const newId = uniqueTestId("atmn_rn_bare_new");
		const planId = uniqueTestId("atmn_rn_bare_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer(),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${oldId}", name: "Renamed Bare", type: "metered", consumable: true }),`,
				plans: `\n\t\tplan({ planId: "${planId}", name: "Renamed Bare Plan", items: [{ featureId: "${oldId}", included: 100 }] }),`,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			// A plain new fixture under a different featureId: no internalId ties
			// it to the old row, so the server sees a create and an implicit
			// removal of whatever the config no longer lists.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ featureId: "${newId}", name: "Renamed Bare", type: "metered", consumable: true }),`,
						plans: `\n\t\tplan({ planId: "${planId}", name: "Renamed Bare Plan", items: [{ featureId: "${newId}", included: 100 }] }),`,
					}),
				}),
			);
			await scenario.push();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string; internalId: string | null }>;
			};
			const created = catalog.features.find((feature) => feature.id === newId);
			expect(created).toBeDefined();
			expect(catalog.features.find((feature) => feature.id === oldId)).toBeUndefined();

			// The old row still exists, archived — the customer's entitlement
			// history keeps it from hard-deleting.
			const dbFeatures = await FeatureService.list({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			});
			const archived = dbFeatures.find((feature) => feature.id === oldId);
			expect(archived?.archived).toBe(true);
			expect(archived?.internal_id).not.toBe(created?.internalId);
		} finally {
			scenario.cleanup();
		}
	},
);
