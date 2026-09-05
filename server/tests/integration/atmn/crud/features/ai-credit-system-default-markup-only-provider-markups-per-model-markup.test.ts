/**
 * atmn crud/features — ai credit system [default markup only, provider markups, per-model markups] (consumable only)
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

const MARKUP_CASES = {
	"default markup only": {
		fields: `
			defaultMarkup: 20,`,
		assertRow: (row: CatalogFeatureRow) => {
			expect(row.defaultMarkup).toBe(20);
			expect(row.providerMarkups ?? null).toBeNull();
			expect(row.modelMarkups ?? null).toBeNull();
		},
	},
	"provider markups": {
		fields: `
			providerMarkups: { openai: { markup: 10 }, anthropic: { markup: 15 } },`,
		assertRow: (row: CatalogFeatureRow) => {
			expect(row.providerMarkups).toEqual({
				openai: { markup: 10 },
				anthropic: { markup: 15 },
			});
		},
	},
	"per-model markups": {
		fields: `
			modelMarkups: { "openai/gpt-4o": { markup: 25 }, "anthropic/claude-sonnet-4": { inputCost: 3, outputCost: 15 } },`,
		assertRow: (row: CatalogFeatureRow) => {
			expect(row.modelMarkups).toEqual({
				"openai/gpt-4o": { markup: 25 },
				"anthropic/claude-sonnet-4": { inputCost: 3, outputCost: 15 },
			});
		},
	},
} as const;

type CatalogFeatureRow = {
	id: string;
	type: string;
	defaultMarkup?: number;
	providerMarkups?: Record<string, { markup: number }> | null;
	modelMarkups?: Record<string, Record<string, number>> | null;
};

for (const [label, { fields, assertRow }] of Object.entries(MARKUP_CASES)) {
	test.concurrent(`ai credit system (${label})`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: `
		feature({
			featureId: "ai_credits",
			name: "AI Credits",
			type: "ai_credit_system",
			consumable: true,
			creditSchema: [],${fields}
		}),`,
			}),
		});

		try {
			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				features: CatalogFeatureRow[];
			};
			const aiCredits = catalog.features.find((row) => row.id === "ai_credits");
			expect(aiCredits?.type).toBe("ai_credit_system");
			if (aiCredits) assertRow(aiCredits);
		} finally {
			scenario.cleanup();
		}
	});
}
