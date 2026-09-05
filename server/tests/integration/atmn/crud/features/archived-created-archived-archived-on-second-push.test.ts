/**
 * atmn crud/features — archived [created archived, archived on second push]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const featureLiteral = ({ archived }: { archived: boolean }): string => `
		feature({ featureId: "sso", name: "SSO", type: "boolean"${archived ? ", archived: true" : ""} }),`;

type CatalogFeatureRow = { id: string; archived: boolean };

// Creating a feature already archived is unsupported by decision; only the
// second-push archive is covered.
for (const label of ["archived on second push"] as const) {
	test.concurrent(`archived (${label})`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `atmn_archived_${label.replace(/\s+/g, "_")}@autumn.test`,
				}),
			],
			config: configBody({
				features: featureLiteral({ archived: false }),
			}),
		});

		try {
			if (label === "archived on second push") {
				// First push lands the feature live, so the second push is the one
				// that actually archives it.
				await scenario.push();
				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({ features: featureLiteral({ archived: true }) }),
					}),
				);
			}

			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({
				include_archived: true,
			})) as unknown as { features: CatalogFeatureRow[] };
			const sso = catalog.features.find((row) => row.id === "sso");
			expect(sso?.archived).toBe(true);
		} finally {
			scenario.cleanup();
		}
	});
}
