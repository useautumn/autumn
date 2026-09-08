/**
 * atmn scenarios/features — omit the `features` key → server untouched; `features: []` → everything deleted
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
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const oneBooleanFeature = (featureId: string): string =>
	`\n\t\tfeature({ featureId: "${featureId}", name: "Flag", type: "boolean" }),`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: omitting `features` leaves the catalog alone, `features: []` deletes it")}`,
	async () => {
		const featureId = uniqueTestId("atmn_omit_feat");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: oneBooleanFeature(featureId) }),
		});

		try {
			await scenario.push();
			const afterCreate = await scenario.client.get({});
			expect(
				(afterCreate as { features: Array<{ id: string }> }).features.map(
					(feature) => feature.id,
				),
			).toContain(featureId);

			// No `features` key at all: not this config's collection, untouched.
			scenario.writeConfig(atmnConfigSource({ body: configBody({}) }));
			const untouched = await scenario.push({ dryRun: true });
			expect(untouched.output).toContain("No changes");
			const stillThere = await scenario.client.get({});
			expect(
				(stillThere as { features: Array<{ id: string }> }).features.map(
					(feature) => feature.id,
				),
			).toContain(featureId);

			// `features: []`: mine, and empty — every feature this config owns goes.
			scenario.writeConfig(
				atmnConfigSource({ body: configBody({ features: "" }) }),
			);
			await scenario.push();
			const afterDelete = await scenario.client.get({});
			expect(
				(afterDelete as { features: Array<{ id: string }> }).features.map(
					(feature) => feature.id,
				),
			).not.toContain(featureId);
		} finally {
			scenario.cleanup();
		}
	},
);
