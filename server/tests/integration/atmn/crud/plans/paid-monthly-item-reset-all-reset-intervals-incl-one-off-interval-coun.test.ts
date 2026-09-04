/**
 * atmn crud/plans — paid [monthly] [item reset: all reset intervals incl one_off] [interval_count 1, 3]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	paidMonthly,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const RESET_INTERVALS = [
	"one_off",
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"quarter",
	"semi_annual",
	"year",
] as const;
const INTERVAL_COUNTS = [1, 3] as const;

// client.get() returns fixture-shaped (camelCase) objects, not the wire.
type CatalogPlanRow = {
	id: string;
	items: Array<{
		featureId: string;
		reset?: { interval?: string; intervalCount?: number } | null;
	}>;
};

for (const interval of RESET_INTERVALS) {
	for (const intervalCount of INTERVAL_COUNTS) {
		test.concurrent(
			`paid [monthly] [item reset: ${interval}] [interval_count ${intervalCount}]`,
			async () => {
				const scenario = await initAtmnScenario({
					setup: [
						s.platform.create({
							userEmail: `${uniqueTestId("atmn")}@autumn.test`,
						}),
					],
					config: configBody({
						features: everyFeatureType,
						plans: paidMonthly({
							items: `
				{
					featureId: "messages",
					included: 100,
					reset: { interval: "${interval}", intervalCount: ${intervalCount} },
				},`,
						}),
					}),
				});

				try {
					const { freshWire, freshFiles } = await expectRoundTrip({ scenario });
					const plans = freshWire.plans as Array<Record<string, unknown>>;
					const pro = plans.find((plan) => plan.plan_id === "pro");
					const items = pro?.items as Array<Record<string, unknown>>;
					const item = items.find((entry) => entry.feature_id === "messages");
					const reset = item?.reset as Record<string, unknown> | undefined;

					const catalog = (await scenario.client.get({})) as unknown as {
						plans: CatalogPlanRow[];
					};
					const catalogReset = catalog.plans
						.find((plan) => plan.id === "pro")
						?.items.find((entry) => entry.featureId === "messages")?.reset;

					const fixtureText = freshFiles.get("autumn.config.ts") ?? "";

					expect(reset?.interval).toBe(interval);

					// 1 is the implicit default: the server omits interval_count when
					// it's 1, so it never round-trips as an explicit value, only n > 1
					// does — checked on the wire, the catalog, and the fixture text.
					if (intervalCount === 1) {
						expect(reset?.interval_count).toBeUndefined();
						expect(catalogReset?.intervalCount).toBeUndefined();
						expect(fixtureText).not.toContain("intervalCount: 1,");
					} else {
						expect(reset?.interval_count).toBe(intervalCount);
						expect(catalogReset?.intervalCount).toBe(intervalCount);
						expect(fixtureText).toContain(`intervalCount: ${intervalCount},`);
					}
				} finally {
					scenario.cleanup();
				}
			},
		);
	}
}
