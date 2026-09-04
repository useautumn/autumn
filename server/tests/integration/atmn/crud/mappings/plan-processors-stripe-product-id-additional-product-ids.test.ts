/**
 * atmn crud/mappings — plan processors [stripe product_id, additional_product_ids]
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
	processors?: {
		stripe?: { productId?: string; additionalProductIds?: string[] } | null;
	};
};

// `applyPlanProcessorsToProduct` stamps this straight onto the product row with
// no Stripe existence check, so a made-up id is fine for a round-trip test.
const acmePlan = `
		plan({
			planId: "acme",
			name: "Acme",
			processors: {
				stripe: {
					productId: "prod_fake_acme_plan",
					additionalProductIds: ["prod_fake_acme_alias"],
				},
			},
		}),`;

test.concurrent(
	"plan processors round-trip with --include-mappings",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ plans: acmePlan }),
		});

		try {
			const { freshWire } = await expectRoundTrip({
				scenario,
				includeMappings: true,
			});

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: CatalogPlanRow[];
			};
			const acme = catalog.plans.find((row) => row.id === "acme");
			expect(acme?.processors?.stripe).toEqual(
				expect.objectContaining({
					productId: "prod_fake_acme_plan",
					additionalProductIds: ["prod_fake_acme_alias"],
				}),
			);

			const plans = freshWire.plans as Array<Record<string, unknown>>;
			const wireAcme = plans.find((row) => row.plan_id === "acme");
			expect(wireAcme?.processors).toEqual({
				stripe: {
					product_id: "prod_fake_acme_plan",
					additional_product_ids: ["prod_fake_acme_alias"],
				},
			});
		} finally {
			scenario.cleanup();
		}
	},
);
