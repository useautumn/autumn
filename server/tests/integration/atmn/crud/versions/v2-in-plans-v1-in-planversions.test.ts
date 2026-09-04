/**
 * atmn crud/versions — v2 in plans, v1 in planVersions → two versions, v2 active; assert the server's numbering (creation order, v1 = version 2)
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
		// Both rows are new for this org: nothing about "pro" exists before this
		// single push, so version numbers come purely from request order — the
		// active `plans` row is created before the `planVersions` history row.
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: "atmn_versions_v2v1@autumn.test" }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: versionedPro({ versionSlug: "v2", amount: 49 }),
				planVersions: versionedPro({ versionSlug: "v1", amount: 39 }),
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
