/**
 * atmn crud/licenses — license plan is itself versioned [links v1, links v2] — version_slug is overlay-hidden, so the link follows the active version; assert that
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

type CatalogPlanRow = {
	id: string;
	versionSlug?: string | null;
	version: number;
	active?: boolean;
	licenses?: Array<{ licensePlanId: string; included: number }>;
};

/** The license link has no version_slug field on the wire — it can only ever
 * point at the license plan_id, never a specific version. */
const seatVersion = ({
	versionSlug,
	amount,
}: {
	versionSlug?: string;
	amount: number;
}): string => `
		plan({
			planId: "seat",
			name: "Seat",${versionSlug ? `\n\t\t\tversionSlug: "${versionSlug}",` : ""}
			price: { amount: ${amount}, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
		}),`;

test.concurrent(
	"license link follows seat's active version without restating anything",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: `${seatVersion({ amount: 15 })}${enterpriseWithSeats({ included: 25 })}`,
			}),
		});

		try {
			await scenario.push();

			let catalog = (await scenario.client.get({})) as unknown as {
				plans: CatalogPlanRow[];
			};
			expect(
				catalog.plans.find((row) => row.id === "enterprise")?.licenses,
			).toEqual([
				expect.objectContaining({ licensePlanId: "seat", included: 25 }),
			]);

			// Mint seat v2 — enterprise's config is untouched, so the link's
			// resolution has to move on its own once v2 becomes active.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: `${seatVersion({ versionSlug: "v2", amount: 20 })}${enterpriseWithSeats({ included: 25 })}`,
						planVersions: seatVersion({ versionSlug: "v1", amount: 15 }),
					}),
				}),
			);
			await scenario.push();

			catalog = (await scenario.client.get({
				include_versions: true,
			})) as unknown as { plans: CatalogPlanRow[] };
			const seatVersions = catalog.plans
				.filter((row) => row.id === "seat")
				.sort((a, b) => a.version - b.version);
			expect(seatVersions).toEqual([
				expect.objectContaining({ versionSlug: "v1", active: false }),
				expect.objectContaining({ versionSlug: "v2", active: true }),
			]);
			expect(
				catalog.plans.find((row) => row.id === "enterprise")?.licenses,
			).toEqual([
				expect.objectContaining({ licensePlanId: "seat", included: 25 }),
			]);

			// enterprise's own config never changed, so re-pushing it previews none —
			// the link didn't need to be restated to follow seat's new active version.
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
