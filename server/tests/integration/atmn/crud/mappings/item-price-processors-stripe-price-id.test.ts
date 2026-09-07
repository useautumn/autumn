/**
 * atmn crud/mappings — item price processors [stripe price_id]
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
	items: Array<{
		featureId: string;
		price?: { processors?: { stripe?: { priceId?: string } | null } } | null;
	}>;
};

// createInStripe: false threads a stated item-price stripe_price_id through
// unresolved (no real Stripe existence check), same as the base-price case.
const proPlan = `
		plan({
			planId: "pro",
			name: "Pro",
			createInStripe: false,
			price: { amount: 49, interval: "month" },
			items: [
				{
					featureId: "seats",
					included: 1,
					price: {
						billingMethod: "prepaid",
						interval: "month",
						amount: 10,
						billingUnits: 1,
						processors: { stripe: { priceId: "price_fake_item_1" } },
					},
				},
			],
		}),`;

test.concurrent(
	"item price processors round-trip with --include-mappings",
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
			expect(pro?.items[0]?.price?.processors?.stripe).toEqual(
				expect.objectContaining({ priceId: "price_fake_item_1" }),
			);

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wirePro = plans.find((row) => row.plan_id === "pro");
			const wireItems = wirePro?.items as Array<Record<string, unknown>>;
			const wirePrice = wireItems[0]?.price as Record<string, unknown>;
			expect(wirePrice.processors).toEqual({
				stripe: { price_id: "price_fake_item_1" },
			});
		} finally {
			scenario.cleanup();
		}
	},
);
