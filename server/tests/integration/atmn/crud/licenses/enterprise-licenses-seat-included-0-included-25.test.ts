/**
 * atmn crud/licenses — enterprise licenses seat [included 0, included 25]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	licenses?: Array<{ licensePlanId: string; included: number }>;
};

for (const included of [0, 25] as const) {
	test.concurrent(
		`enterprise licenses seat, included ${included}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: configBody({
					features: everyFeatureType,
					plans: `${seatPlan}${enterpriseWithSeats({ included })}`,
				}),
			});

			try {
				const { freshWire } = await expectRoundTrip({ scenario });

				const catalog = (await scenario.client.get({})) as unknown as {
					plans: CatalogPlanRow[];
				};
				const enterprise = catalog.plans.find((row) => row.id === "enterprise");
				expect(enterprise?.licenses).toEqual([
					expect.objectContaining({ licensePlanId: "seat", included }),
				]);

				const plans = freshWire.plans as Array<Record<string, unknown>>;
				const wireEnterprise = plans.find(
					(row) => row.plan_id === "enterprise",
				);
				expect(wireEnterprise?.licenses).toEqual([
					expect.objectContaining({ license_plan_id: "seat", included }),
				]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
