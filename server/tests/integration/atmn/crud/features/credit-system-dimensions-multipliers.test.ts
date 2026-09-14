/**
 * atmn crud/features — credit system rate card with dimensions and multipliers
 *
 * A dimensioned row (flat + graduated dimensions, a priority, a multiplier)
 * pushes, previews as no-op, pulls back into a config the server also finds
 * nothing to apply for, and reads back with every rule intact.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const features = `
		feature({ featureId: "actions", name: "Actions", type: "metered", consumable: true }),
		feature({
			featureId: "credits",
			name: "Credits",
			type: "credit_system",
			consumable: true,
			creditSchema: [
				{
					meteredFeatureId: "actions",
					billingUnits: 1,
					creditCost: 1,
					dimensions: {
						size_large: { match: { size: "large" }, creditCost: 16 },
						size_large_region_eu: {
							match: { size: "large", region: "eu" },
							creditCost: 20,
							priority: 1,
						},
						size_xl: {
							match: { size: "xl" },
							tierBehavior: "graduated",
							tiers: [
								{ to: 5, creditCost: 2 },
								{ to: "inf", creditCost: 1 },
							],
						},
					},
					multipliers: {
						lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
					},
				},
			],
		}),`;

type CatalogFeatureRow = {
	id: string;
	type: string;
	creditSchema: Array<{
		meteredFeatureId: string;
		dimensions?: Record<string, Record<string, unknown>>;
		multipliers?: Record<string, Record<string, unknown>>;
	}>;
};

test.concurrent(
	"credit system rate card round-trips dimensions and multipliers",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features }),
		});

		try {
			const { freshFiles } = await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				features: CatalogFeatureRow[];
			};
			const credits = catalog.features.find((row) => row.id === "credits");
			const [row] = credits?.creditSchema ?? [];

			expect(row?.meteredFeatureId).toBe("actions");
			expect(Object.keys(row?.dimensions ?? {}).sort()).toEqual([
				"size_large",
				"size_large_region_eu",
				"size_xl",
			]);
			expect(row?.dimensions?.size_large_region_eu).toEqual(
				expect.objectContaining({
					match: { size: "large", region: "eu" },
					creditCost: 20,
					priority: 1,
				}),
			);
			expect(row?.dimensions?.size_xl).toEqual(
				expect.objectContaining({
					tierBehavior: "graduated",
					tiers: [
						{ to: 5, creditCost: 2 },
						{ to: "inf", creditCost: 1 },
					],
				}),
			);
			expect(row?.multipliers?.lifecycle_spot).toEqual(
				expect.objectContaining({ match: { lifecycle: "spot" }, factor: 0.3 }),
			);

			const pulled = [...freshFiles.values()].join("\n");
			expect(pulled).toContain("size_large_region_eu");
			expect(pulled).toContain("lifecycle_spot");
		} finally {
			scenario.cleanup();
		}
	},
);
