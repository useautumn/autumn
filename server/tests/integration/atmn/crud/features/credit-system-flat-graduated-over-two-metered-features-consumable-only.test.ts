/**
 * atmn crud/features — credit system [flat, graduated] over two metered features (consumable only)
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

/** The metered pair every credit_system entry draws from. */
const meteredFeatures = `
		feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true }),
		feature({ featureId: "api_calls", name: "API Calls", type: "metered", consumable: true }),`;

const CREDIT_SCHEMAS = {
	flat: `[
			{ meteredFeatureId: "messages", creditCost: 1 },
			{ meteredFeatureId: "api_calls", creditCost: 2 },
		]`,
	graduated: `[
			{ meteredFeatureId: "messages", tierBehavior: "graduated", tiers: [{ to: 100, creditCost: 1 }, { to: "inf", creditCost: 2 }] },
			{ meteredFeatureId: "api_calls", tierBehavior: "graduated", tiers: [{ to: 1000, creditCost: 1 }, { to: "inf", creditCost: 2 }] },
		]`,
} as const;

type CatalogFeatureRow = {
	id: string;
	type: string;
	creditSchema: Array<Record<string, unknown>>;
};

for (const tierBehavior of ["flat", "graduated"] as const) {
	test.concurrent(
		`credit system over two metered features (${tierBehavior})`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `atmn_credit_${tierBehavior}@autumn.test`,
					}),
				],
				config: configBody({
					features: `${meteredFeatures}
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
			consumable: true,
			creditSchema: ${CREDIT_SCHEMAS[tierBehavior]},
		}),`,
				}),
			});

			try {
				await expectRoundTrip({ scenario });

				const catalog = (await scenario.client.get({})) as unknown as {
					features: CatalogFeatureRow[];
				};
				const credits = catalog.features.find((row) => row.id === "credits");
				expect(credits?.type).toBe("credit_system");
				expect(credits?.creditSchema).toHaveLength(2);
				expect(credits?.creditSchema[0]).toEqual(
					expect.objectContaining({
						meteredFeatureId: "messages",
						...(tierBehavior === "graduated"
							? { tierBehavior: "graduated" }
							: { creditCost: 1 }),
					}),
				);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
