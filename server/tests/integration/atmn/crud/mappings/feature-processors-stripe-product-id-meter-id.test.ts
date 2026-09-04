/**
 * atmn crud/mappings — feature processors [stripe product_id, meter_id]
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

type CatalogFeatureRow = {
	id: string;
	processors?: { stripe?: { productId?: string; meterId?: string } };
};

// featureProcessorsToDbFields stamps these straight onto the feature row with
// no Stripe existence check, so made-up ids are fine for a round-trip test.
const apiCallsFeature = `
		feature({
			featureId: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			processors: {
				stripe: { productId: "prod_fake_feature", meterId: "mtr_fake_feature" },
			},
		}),`;

test.concurrent(
	"feature processors round-trip with --include-mappings",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: apiCallsFeature }),
		});

		try {
			const { freshWire } = await expectRoundTrip({
				scenario,
				includeMappings: true,
			});

			const catalog = (await scenario.client.get({})) as unknown as {
				features: CatalogFeatureRow[];
			};
			const apiCalls = catalog.features.find((row) => row.id === "api_calls");
			expect(apiCalls?.processors?.stripe).toEqual(
				expect.objectContaining({
					productId: "prod_fake_feature",
					meterId: "mtr_fake_feature",
				}),
			);

			const features = freshWire.features as Array<Record<string, unknown>>;
			const wireApiCalls = features.find(
				(row) => row.feature_id === "api_calls",
			);
			expect(wireApiCalls?.processors).toEqual({
				stripe: {
					product_id: "prod_fake_feature",
					meter_id: "mtr_fake_feature",
				},
			});
		} finally {
			scenario.cleanup();
		}
	},
);
