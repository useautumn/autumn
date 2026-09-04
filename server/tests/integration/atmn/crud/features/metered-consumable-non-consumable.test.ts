/**
 * atmn crud/features — metered [consumable, non consumable]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogFeatureRow = { id: string; type: string; consumable: boolean };

for (const consumable of [true, false] as const) {
	test.concurrent(`metered consumable=${consumable}`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `atmn_metered_${consumable}@autumn.test`,
				}),
			],
			config: configBody({
				features: `
		feature({ featureId: "api_calls", name: "API Calls", type: "metered", consumable: ${consumable} }),`,
			}),
		});

		try {
			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				features: CatalogFeatureRow[];
			};
			const apiCalls = catalog.features.find((row) => row.id === "api_calls");
			expect(apiCalls).toEqual(
				expect.objectContaining({ type: "metered", consumable }),
			);
		} finally {
			scenario.cleanup();
		}
	});
}
