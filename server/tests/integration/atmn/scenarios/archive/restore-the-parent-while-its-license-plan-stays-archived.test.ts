/**
 * atmn scenarios/archive — restore the parent while its license plan stays archived → clean error naming the license plan, nothing else changed
 *
 * one push carries the whole batch, so restore order must not matter
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
import type { AutumnClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

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
			setup: [s.platform.create({ userEmail: "atmn@autumn.test" })],
			config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
		});

		try {
			await scenario.push();

			// The parent also clears its licenses[] in the same push: the
			// anchor-lifecycle guard reads the still-declared link regardless of
			// the parent's own archived state, so archiving both together needs
			// the unlink to be same-call.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "seat", archived: true }),
		plan({ planId: "enterprise", archived: true, licenses: [] }),
	],
}`,
				}),
			);
			await scenario.push();

			// Restate the license link so the restore re-validates it — the seat
			// plan is left archived, untouched by this push.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			planId: "enterprise",
			name: "Enterprise",
			archived: false,
			price: { amount: 999, interval: "month" },
			items: [{ featureId: "sso" }, { featureId: "audit_log" }],
			licenses: [{ licensePlanId: "seat", included: 25 }],
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
