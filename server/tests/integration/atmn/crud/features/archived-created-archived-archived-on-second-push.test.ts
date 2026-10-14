import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

const featureLiteral = ({ archived }: { archived: boolean }): string => `
		feature({ featureId: "sso", name: "SSO", type: "boolean"${archived ? ", archived: true" : ""} }),`;

type CatalogFeatureRow = { id: string; archived: boolean };

for (const label of ["archived on second push"] as const) {
	test.concurrent(`archived (${label})`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: featureLiteral({ archived: false }),
			}),
		});

		try {
			if (label === "archived on second push") {
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
