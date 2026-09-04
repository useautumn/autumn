/**
 * atmn crud/plans — paid [monthly] [interval_count 1, 3]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const INTERVAL_COUNTS = [1, 3] as const;

// client.get() returns fixture-shaped (camelCase) objects, not the wire.
type CatalogPlanRow = {
	id: string;
	price?: { intervalCount?: number } | null;
};

for (const intervalCount of INTERVAL_COUNTS) {
	test.concurrent(
		`paid [monthly] [interval_count ${intervalCount}]`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: configBody({
					plans: `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month", intervalCount: ${intervalCount} },
			items: [],
		}),`,
				}),
			});

			try {
				const { freshWire, freshFiles } = await expectRoundTrip({ scenario });
				const plans = freshWire.plans as Array<Record<string, unknown>>;
				const pro = plans.find((plan) => plan.plan_id === "pro");
				const price = pro?.price as { interval_count?: number } | undefined;

				const catalog = (await scenario.client.get({
					include_versions: true,
				})) as unknown as { plans: CatalogPlanRow[] };
				const catalogPrice = catalog.plans.find(
					(plan) => plan.id === "pro",
				)?.price;

				const fixtureText = freshFiles.get("autumn.config.ts") ?? "";

				// 1 is the implicit default: the server omits interval_count when it's
				// 1, so it never round-trips as an explicit value, only n > 1 does.
				if (intervalCount === 1) {
					expect(price?.interval_count).toBeUndefined();
					expect(catalogPrice?.intervalCount).toBeUndefined();
					expect(fixtureText).not.toContain("intervalCount: 1,");
				} else {
					expect(price?.interval_count).toBe(intervalCount);
					expect(catalogPrice?.intervalCount).toBe(intervalCount);
					expect(fixtureText).toContain(`intervalCount: ${intervalCount},`);
				}
			} finally {
				scenario.cleanup();
			}
		},
	);
}
