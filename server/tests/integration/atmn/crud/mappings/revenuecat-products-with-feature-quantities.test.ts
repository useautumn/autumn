/**
 * atmn crud/mappings — revenuecat [products with feature quantities]
 *
 * `--include-mappings`
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	processors?: {
		revenuecat?: {
			products: Array<{
				productId: string;
				featureQuantities?: Array<{ featureId: string; quantity?: number }>;
			}>;
		} | null;
	};
};

// RevenueCat mappings are only checked for uniqueness against this org's own
// rows (assertRevenueCatIdsUnclaimed), never against a real RC account, so a
// made-up product id round-trips without one.
const proPlan = `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
			processors: {
				revenuecat: {
					products: [
						{
							productId: "rc_fake_pro_monthly",
							featureQuantities: [{ featureId: "seats", quantity: 5 }],
						},
					],
				},
			},
		}),`;

test.concurrent(
	"revenuecat mappings round-trip with --include-mappings",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: everyFeatureType, plans: proPlan }),
		});

		try {
			const { freshWire } = await expectRoundTrip({
				scenario,
				includeMappings: true,
			});

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: CatalogPlanRow[];
			};
			const pro = catalog.plans.find((row) => row.id === "pro");
			expect(pro?.processors?.revenuecat?.products).toEqual([
				expect.objectContaining({
					productId: "rc_fake_pro_monthly",
					featureQuantities: [
						expect.objectContaining({ featureId: "seats", quantity: 5 }),
					],
				}),
			]);

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wirePro = plans.find((row) => row.plan_id === "pro");
			const wireProcessors = wirePro?.processors as Record<string, unknown>;
			expect(wireProcessors.revenuecat).toEqual({
				products: [
					{
						product_id: "rc_fake_pro_monthly",
						feature_quantities: [{ feature_id: "seats", quantity: 5 }],
					},
				],
			});
		} finally {
			scenario.cleanup();
		}
	},
);
