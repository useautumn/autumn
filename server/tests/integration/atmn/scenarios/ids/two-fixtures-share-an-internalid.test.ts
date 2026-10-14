import { expect, spyOn, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/ids: two fixtures sharing an internalId is a lint error, no request sent")}`,
	async () => {
		const sharedInternalId = uniqueTestId("atmn_shared_internal");
		const featureA = uniqueTestId("atmn_dup_id_a");
		const featureB = uniqueTestId("atmn_dup_id_b");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: `
		feature({ internalId: "${sharedInternalId}", featureId: "${featureA}", name: "Dup A", type: "boolean" }),
		feature({ internalId: "${sharedInternalId}", featureId: "${featureB}", name: "Dup B", type: "boolean" }),`,
			}),
		});

		const previewUpdateSpy = spyOn(scenario.client, "previewUpdate");

		try {
			await expect(scenario.push()).rejects.toThrow(/internalId/);
			expect(previewUpdateSpy).not.toHaveBeenCalled();

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string }>;
			};
			expect(catalog.features.map((feature) => feature.id)).not.toContain(
				featureA,
			);
			expect(catalog.features.map((feature) => feature.id)).not.toContain(
				featureB,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
