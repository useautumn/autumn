/**
 * atmn crud/mappings — base price processors [stripe price_id]
 *
 * `--include-mappings`
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	price?: {
		amount: number;
		processors?: { stripe?: { priceId?: string } | null };
	} | null;
};

// A stated base-price stripe_price_id is validated against real Stripe unless
// the plan opts out of Stripe entirely — createInStripe: false threads it
// through unresolved, so a made-up id round-trips without a real account.
const proPlan = `
		plan({
			planId: "pro",
			name: "Pro",
			createInStripe: false,
			price: {
				amount: 49,
				interval: "month",
				processors: { stripe: { priceId: "price_fake_base_1" } },
			},
		}),`;

test.concurrent(
	"base price processors round-trip with --include-mappings",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ plans: proPlan }),
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
			expect(pro?.price?.processors?.stripe).toEqual(
				expect.objectContaining({ priceId: "price_fake_base_1" }),
			);

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wirePro = plans.find((row) => row.plan_id === "pro");
			const wirePrice = wirePro?.price as Record<string, unknown>;
			expect(wirePrice.processors).toEqual({
				stripe: { price_id: "price_fake_base_1" },
			});
		} finally {
			scenario.cleanup();
		}
	},
);
