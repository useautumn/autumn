/**
 * atmn scenarios/lint — a plan that only appears in planVersions
 *
 * History alone is a plan nobody can buy. Lint refuses with the exact message
 * and sends nothing; the same wire sent raw gets the server's own version of
 * that guidance, so API users are told the same thing.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ACTIVE_HINT =
	"At least one version of each plan must be active. planVersions is for historical inactive products, and plans is for the active version.";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/lint: a plan only in planVersions fails lint, and the raw wire gets the same guidance from the server")}`,
	async () => {
		const free = uniqueTestId("atmn_free");
		const pro = uniqueTestId("atmn_pro");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		${paidMonthly({ planId: free, amount: 0 })}
	],
	planVersions: [
		${paidMonthly({ planId: pro, amount: 20, extra: `\n\t\t\tversionSlug: "v1",` })}
	],
}`,
		});

		try {
			const error = await scenario.push().catch((thrown) => thrown as Error);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				`${ACTIVE_HINT} "${pro}" (autumn.config.ts:`,
			);
			expect((error as Error).message).not.toContain("catalogV2");

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.find((row) => row.id === pro)).toBeUndefined();

			// The wire `atmn()` would have built, sent straight to the server.
			const raw = await scenario.client
				.update({
					plans: [
						{
							plan_id: free,
							name: "Free",
							price: { amount: 0, interval: "month" },
							items: [],
							active: true,
						},
						{
							plan_id: pro,
							name: "Pro",
							version_slug: "v1",
							price: { amount: 20, interval: "month" },
							items: [],
							active: false,
						},
					],
					skip_version_deletions: false,
					skip_deletions: false,
					migration: { draft: true },
				} as never)
				.catch((thrown) => thrown as Error);
			expect(raw).toBeInstanceOf(Error);
			expect((raw as Error).message).toContain(
				`Cannot set active to false on plan "${pro}": no version of it is active in this update. ${ACTIVE_HINT}`,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
