import { test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: re-pushing the same config after a restore previews nothing further")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "seat", versionSlug: "v1", archived: true }),
		plan({ active: true, planId: "enterprise", versionSlug: "v1", archived: true, licenses: [] }),
	],
}`,
				}),
			);
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "seat",
			name: "Seat",
			versionSlug: "v1",
			archived: false,
			price: { amount: 15, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
		}),
		plan({
			active: true,
			planId: "enterprise",
			name: "Enterprise",
			versionSlug: "v1",
			archived: false,
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", versionSlug: "v1", included: 25 }],
		}),
	],
}`,
				}),
			);
			await scenario.push();

			await scenario.push();
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
