/**
 * atmn crud/versions — versionSlug [custom "2024-pricing", absent = v1]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody, paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

type CatalogPlanRow = { id: string; versionSlug?: string | null };

const VERSION_SLUG_CASES = {
	'custom "2024-pricing"': {
		extra: `
				versionSlug: "2024-pricing",`,
		expectedSlug: "2024-pricing",
	},
	"absent = v1": { extra: "", expectedSlug: "v1" },
} as const;

for (const [label, { extra, expectedSlug }] of Object.entries(
	VERSION_SLUG_CASES,
)) {
	test.concurrent(`versionSlug (${label})`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				plans: paidMonthly({ planId: "pro", items: "", extra }),
			}),
		});

		try {
			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: CatalogPlanRow[];
			};
			const pro = catalog.plans.find((row) => row.id === "pro");
			expect(pro?.versionSlug).toBe(expectedSlug);
		} finally {
			scenario.cleanup();
		}
	});
}
