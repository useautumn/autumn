import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnClient } from "../../../../../../packages/atmn/src/generated/client";

type CatalogPlanRow = { id: string; archived: boolean };

const catalogPlans = async ({
	client,
}: {
	client: AutumnClient;
}): Promise<CatalogPlanRow[]> => {
	const catalog = (await client.get({ include_archived: true })) as unknown as {
		plans: CatalogPlanRow[];
	};
	return catalog.plans;
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: restoring the parent while its license plan stays archived is refused, naming the license plan")}`,
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
			await expect(scenario.push()).rejects.toThrow(/seat/i);

			const plans = await catalogPlans({ client: scenario.client });
			expect(plans.find((row) => row.id === "seat")?.archived).toBe(true);
			expect(plans.find((row) => row.id === "enterprise")?.archived).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);
