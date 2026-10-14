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

const seatVersion = ({
	versionSlug = "v1",
	amount,
	active = true,
}: {
	versionSlug?: string;
	amount: number;
	active?: boolean;
}): string => `
		plan({
			active: ${active},
			planId: "seat",
			name: "Seat",
			versionSlug: "${versionSlug}",
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

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: `${seatVersion({ versionSlug: "v2", amount: 20 })}${enterpriseWithSeats({ included: 25 })}${seatVersion({ versionSlug: "v1", amount: 15, active: false })}`,
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

			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
