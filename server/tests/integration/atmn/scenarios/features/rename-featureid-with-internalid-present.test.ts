/**
 * atmn scenarios/features — rename featureId with internalId present → server renames, no create + delete
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

const internalIdOf = ({ text, featureId }: { text: string; featureId: string }): string => {
	const match = text.match(
		new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`),
	);
	if (!match) throw new Error(`no backfilled internalId found for ${featureId}`);
	return match[1];
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: renaming featureId with internalId present renames the row in place")}`,
	async () => {
		const oldId = uniqueTestId("atmn_rn_old");
		const newId = uniqueTestId("atmn_rn_new");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${oldId}", name: "Renamed", type: "boolean" }),`,
			}),
		});

		try {
			await scenario.push();
			const internalId = internalIdOf({
				text: scenario.files().get("autumn.config.ts") ?? "",
				featureId: oldId,
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ internalId: "${internalId}", featureId: "${newId}", name: "Renamed", type: "boolean" }),`,
					}),
				}),
			);
			await scenario.push();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string; internalId: string | null }>;
			};
			const renamed = catalog.features.find((feature) => feature.id === newId);
			expect(renamed?.internalId).toBe(internalId);
			expect(catalog.features.find((feature) => feature.id === oldId)).toBeUndefined();

			// Same row, not a create + delete: exactly one feature with this internalId.
			expect(
				catalog.features.filter((feature) => feature.internalId === internalId),
			).toHaveLength(1);

			const wire = await scenario.wireFromConfig();
			const preview = (await scenario.client.previewUpdate(wire)) as {
				features: Array<{ action?: string }>;
			};
			expect(preview.features.filter((row) => row.action !== "none")).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
