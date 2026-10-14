import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/ids: a stale internalId whose row was deleted server-side is treated as new: the row comes back with a fresh id written into the fixture")}`,
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
				?.match(
					new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`),
				)?.[1];
			expect(internalId).toBeTruthy();

			await scenario.client.update({
				remove_features: [{ feature_id: featureId }],
			} as Record<string, unknown>);
			const afterDelete = (await scenario.client.get({})) as {
				features: Array<{ id: string }>;
			};
			expect(afterDelete.features.map((feature) => feature.id)).not.toContain(
				featureId,
			);

			await scenario.push();
			const recreated = (await scenario.client.get({})) as {
				features: { id: string; internalId?: string | null }[];
			};
			const row = recreated.features.find(
				(feature) => feature.id === featureId,
			);
			expect(row?.internalId).toBeTruthy();
			expect(row?.internalId).not.toBe(internalId);
			const rewritten = scenario
				.files()
				.get("autumn.config.ts")
				?.match(
					new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`),
				)?.[1];
			expect(rewritten).toBe(row?.internalId ?? undefined);
		} finally {
			scenario.cleanup();
		}
	},
);
