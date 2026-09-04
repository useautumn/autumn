/**
 * atmn scenarios/ids — stale internalId (row deleted on the server) → 400 "No feature exists for internal_id" surfaced, config untouched
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/ids: a stale internalId whose row was deleted server-side 400s, the config stays untouched")}`,
	async () => {
		const featureId = uniqueTestId("atmn_stale_id");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${featureId}", name: "Stale", type: "boolean" }),`,
			}),
		});

		try {
			await scenario.push();
			const internalId = scenario
				.files()
				.get("autumn.config.ts")
				?.match(new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`))
				?.[1];
			expect(internalId).toBeTruthy();

			// Deleted through the API directly — the dashboard/another tool, not
			// this config — so the local fixture still states the now-dead id.
			await scenario.client.update({
				remove_features: [{ feature_id: featureId }],
			} as Record<string, unknown>);
			const afterDelete = (await scenario.client.get({})) as {
				features: Array<{ id: string }>;
			};
			expect(afterDelete.features.map((feature) => feature.id)).not.toContain(
				featureId,
			);

			const before = scenario.files();
			await expect(scenario.push()).rejects.toThrow(
				new RegExp(`No feature exists for internal_id ${internalId}`),
			);
			expect([...scenario.files().entries()]).toEqual([...before.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
