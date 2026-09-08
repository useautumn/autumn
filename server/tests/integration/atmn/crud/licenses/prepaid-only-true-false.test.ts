/**
 * atmn crud/licenses — [prepaid_only true, false]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	licenses?: Array<{
		licensePlanId: string;
		included: number;
		prepaidOnly?: boolean;
	}>;
};

/** enterpriseWithSeats has no prepaidOnly knob, so this licenses the seat plan directly. */
const enterpriseLicensingSeat = ({
	prepaidOnly,
}: {
	prepaidOnly: boolean;
}): string => `
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", included: 25, prepaidOnly: ${prepaidOnly} }],
		}),`;

for (const prepaidOnly of [true, false] as const) {
	test.concurrent(`license link prepaidOnly=${prepaidOnly}`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: `${seatPlan}${enterpriseLicensingSeat({ prepaidOnly })}`,
			}),
		});

		try {
			// License overflow billing (prepaidOnly: false) is not yet supported
			// server-side — validateLicenseBillingMode rejects it unconditionally.
			if (!prepaidOnly) {
				await expect(scenario.push()).rejects.toThrow(
					/License overflow billing \(prepaid_only: false\) is not yet available\. Set prepaid_only to true\./,
				);
				return;
			}

			const { freshWire } = await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: CatalogPlanRow[];
			};
			const enterprise = catalog.plans.find((row) => row.id === "enterprise");
			expect(enterprise?.licenses).toEqual([
				expect.objectContaining({ licensePlanId: "seat", prepaidOnly }),
			]);

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wireEnterprise = plans.find((row) => row.plan_id === "enterprise");
			expect(wireEnterprise?.licenses).toEqual([
				expect.objectContaining({
					license_plan_id: "seat",
					prepaid_only: prepaidOnly,
				}),
			]);
		} finally {
			scenario.cleanup();
		}
	});
}
