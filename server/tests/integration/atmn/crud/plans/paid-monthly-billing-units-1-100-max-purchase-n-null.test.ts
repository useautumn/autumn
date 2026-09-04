/**
 * atmn crud/plans — paid [monthly] [billing_units 1, 100] [max_purchase n, null]
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

const BILLING_UNITS = [1, 100] as const;
const MAX_PURCHASE = [50, null] as const;

for (const billingUnits of BILLING_UNITS) {
	for (const maxPurchase of MAX_PURCHASE) {
		test.concurrent(
			`paid [monthly] [billing_units ${billingUnits}] [max_purchase ${maxPurchase ?? "null"}]`,
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
					featureId: "seats",
					// A multiple of billingUnits: included usage must divide evenly
					// into the billing units when a feature carries both.
					included: ${billingUnits},
					price: {
						billingMethod: "prepaid",
						interval: "month",
						amount: 10,
						billingUnits: ${billingUnits},
						maxPurchase: ${maxPurchase === null ? "null" : maxPurchase},
					},
				},`,
						}),
					}),
				});

				try {
					const { freshWire } = await expectRoundTrip({ scenario });
					const plans = freshWire.plans as Array<Record<string, unknown>>;
					const pro = plans.find((plan) => plan.plan_id === "pro");
					const items = pro?.items as Array<Record<string, unknown>>;
					const item = items.find((entry) => entry.feature_id === "seats");
					const price = item?.price as Record<string, unknown> | undefined;
					expect(price).toEqual(
						expect.objectContaining({ billing_units: billingUnits }),
					);
					// Pull omits a null field rather than writing it explicitly, so a
					// null max_purchase round-trips as absent, not `max_purchase: null`.
					if (maxPurchase === null) {
						expect(price?.max_purchase).toBeUndefined();
					} else {
						expect(price?.max_purchase).toBe(maxPurchase);
					}
				} finally {
					scenario.cleanup();
				}
			},
		);
	}
}
