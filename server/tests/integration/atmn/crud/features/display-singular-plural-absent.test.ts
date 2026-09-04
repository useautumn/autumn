/**
 * atmn crud/features — display [singular + plural, absent]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogFeatureRow = {
	id: string;
	display?: { singular?: string | null; plural?: string | null };
};

const DISPLAY_CASES = {
	"singular + plural": {
		field: `, display: { singular: "seat", plural: "seats" } `,
		assertRow: (row: CatalogFeatureRow) =>
			expect(row.display).toEqual(
				expect.objectContaining({ singular: "seat", plural: "seats" }),
			),
	},
	absent: {
		field: "",
		assertRow: (row: CatalogFeatureRow) =>
			expect(row.display?.singular ?? null).toBeNull(),
	},
} as const;

for (const [label, { field, assertRow }] of Object.entries(DISPLAY_CASES)) {
	test.concurrent(`display (${label})`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `atmn_display_${label.replace(/[^a-z]+/gi, "_")}@autumn.test`,
				}),
			],
			config: configBody({
				features: `
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false${field} }),`,
			}),
		});

		try {
			await expectRoundTrip({ scenario });

			const catalog = (await scenario.client.get({})) as unknown as {
				features: CatalogFeatureRow[];
			};
			const seats = catalog.features.find((row) => row.id === "seats");
			expect(seats).toBeDefined();
			if (seats) assertRow(seats);
		} finally {
			scenario.cleanup();
		}
	});
}
