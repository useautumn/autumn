import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	versionSlug?: string | null;
	version: number;
	active?: boolean;
};

test.concurrent(
	"v2 in plans, v1 in planVersions creates v2 first (version 1), v1 second (version 2)",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: `${versionedPro({ versionSlug: "v2", amount: 49 })}${versionedPro({ versionSlug: "v1", amount: 39, active: false })}`,
			}),
		});

		try {
			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({
				include_versions: true,
			})) as unknown as { plans: CatalogPlanRow[] };
			const proVersions = catalog.plans
				.filter((row) => row.id === "pro")
				.sort((a, b) => a.version - b.version);

			expect(proVersions).toEqual([
				expect.objectContaining({
					versionSlug: "v2",
					version: 1,
					active: true,
				}),
				expect.objectContaining({
					versionSlug: "v1",
					version: 2,
					active: false,
				}),
			]);
		} finally {
			scenario.cleanup();
		}
	},
);
