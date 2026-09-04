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
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogFeatureRow = {
	id: string;
	processors?: { stripe?: { productId?: string; meterId?: string } };
};

// meter_id IS checked against real Stripe (fillFeatureStripeMeterEventName
// retrieves it), so this needs a real test-mode meter rather than a made-up
// id — unlike product_id, which is stamped through with no existence check.
const apiCallsFeature = ({
	productId,
	meterId,
}: {
	productId: string;
	meterId: string;
}): string => `
		feature({
			featureId: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			processors: {
				stripe: { productId: "${productId}", meterId: "${meterId}" },
			},
		}),`;

test.concurrent(
	"feature processors round-trip with --include-mappings",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: "" }),
		});

		try {
			const stripeProduct = await scenario.ctx.stripeCli.products.create({
				name: `atmn feature product ${uniqueTestId("atmn")}`,
			});
			const stripeMeter = await scenario.ctx.stripeCli.billing.meters.create({
				display_name: `atmn feature meter ${uniqueTestId("atmn")}`,
				event_name: `atmn_meter_${uniqueTestId("atmn")}`,
				default_aggregation: { formula: "sum" },
			});
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: apiCallsFeature({
							productId: stripeProduct.id,
							meterId: stripeMeter.id,
						}),
					}),
				}),
			);

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
					productId: stripeProduct.id,
					meterId: stripeMeter.id,
				}),
			);

			const features = freshWire.features as Array<Record<string, unknown>>;
			const wireApiCalls = features.find(
				(row) => row.feature_id === "api_calls",
			);
			expect(wireApiCalls?.processors).toEqual({
				stripe: {
					product_id: stripeProduct.id,
					meter_id: stripeMeter.id,
				},
			});
		} finally {
			scenario.cleanup();
		}
	},
);
