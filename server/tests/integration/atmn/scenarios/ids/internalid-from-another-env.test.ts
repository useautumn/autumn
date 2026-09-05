/**
 * atmn scenarios/ids — internalId from another env → unknown here, so it names a new resource and is rewritten
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 *
 * Decision pending: `resolveCurrentFeature` (server) scopes its internal_id
 * lookup by org AND env, so an id from a different tenant is exactly as
 * "unknown" as one from a different env of the same tenant — initAtmnScenario
 * has no seam for a second env's key on the same org, so this proves the same
 * guard using a second org instead.
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

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/ids: an internalId from a foreign tenant/env is unknown here: the row is created and the fixture takes this org's id")}`,
	async () => {
		const featureId = uniqueTestId("atmn_foreign_env");

		const origin = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${featureId}", name: "Foreign", type: "boolean" }),`,
			}),
		});

		const foreign = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({}),
		});

		try {
			await origin.push();
			const originInternalId = origin
				.files()
				.get("autumn.config.ts")
				?.match(
					new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`),
				)?.[1];
			expect(originInternalId).toBeTruthy();

			foreign.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: `\n\t\tfeature({ internalId: "${originInternalId}", featureId: "${featureId}", name: "Foreign", type: "boolean" }),`,
					}),
				}),
			);

			await foreign.push();
			const created = (await foreign.client.get({})) as {
				features: { id: string; internalId?: string | null }[];
			};
			const row = created.features.find((feature) => feature.id === featureId);
			expect(row?.internalId).toBeTruthy();
			expect(row?.internalId).not.toBe(originInternalId);
			const rewritten = foreign
				.files()
				.get("autumn.config.ts")
				?.match(
					new RegExp(`internalId: "([^"]+)", featureId: "${featureId}"`),
				)?.[1];
			expect(rewritten).toBe(row?.internalId ?? undefined);
		} finally {
			origin.cleanup();
			foreign.cleanup();
		}
	},
);
