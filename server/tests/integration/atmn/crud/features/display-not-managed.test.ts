/**
 * atmn crud/features — display is not the config's business.
 *
 * The server generates it from the name; a fixture cannot state it, a push
 * leaves it alone, and a pull never writes it.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogFeatureRow = {
	id: string;
	display?: { singular?: string | null; plural?: string | null };
};

test.concurrent("display is neither pushed nor pulled", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn")}@autumn.test`,
			}),
		],
		config: configBody({
			features: `
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false }),`,
		}),
	});

	try {
		const { freshFiles } = await expectRoundTrip({ scenario });
		expect(freshFiles.get("autumn.config.ts")).not.toContain("display");

		// A display set elsewhere survives a push and still stays out of a pull.
		await scenario.client.update({
			features: [
				{
					feature_id: "seats",
					name: "Seats",
					type: "metered",
					consumable: false,
					display: { singular: "seat", plural: "seats" },
				},
			],
			// biome-ignore lint/suspicious/noExplicitAny: a partial catalog update
		} as any);
		await scenario.push();
		const catalog = (await scenario.client.get({})) as unknown as {
			features: CatalogFeatureRow[];
		};
		expect(catalog.features.find((row) => row.id === "seats")?.display).toEqual(
			expect.objectContaining({ singular: "seat", plural: "seats" }),
		);
		expect((await scenario.pull()).output).toContain("Nothing to pull.");
		expect(scenario.files().get("autumn.config.ts")).not.toContain("display");
	} finally {
		scenario.cleanup();
	}
});
