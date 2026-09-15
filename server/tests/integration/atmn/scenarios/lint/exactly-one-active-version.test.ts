/**
 * atmn scenarios/lint — a plan with no active version, or two
 *
 * Every version sits in `plans`, so `active` is the only thing saying which
 * row customers can buy. Lint refuses either mistake with the exact message
 * and sends nothing; the same wire sent raw gets the server's own guidance,
 * so API users are told the same thing.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ACTIVE_HINT =
	"Every version of a plan lives in plans; mark the one customers can buy active: true and the rest active: false.";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/lint: no active version or two active versions fails lint; the raw wire gets the server's guidance")}`,
	async () => {
		const free = uniqueTestId("atmn_free");
		const pro = uniqueTestId("atmn_pro");
		const proVersion = ({ slug, active }: { slug: string; active: boolean }) =>
			paidMonthly({
				planId: pro,
				amount: 20,
				active,
				extra: `\n\t\t\tversionSlug: "${slug}",`,
			});
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		${paidMonthly({ planId: free, amount: 0 })}
		${proVersion({ slug: "v1", active: false })}
	],
}`,
		});

		try {
			const none = await scenario.push().catch((thrown) => thrown as Error);
			expect(none).toBeInstanceOf(Error);
			expect((none as Error).message).toContain(
				`Plan "${pro}" has 1 version and none is active. ${ACTIVE_HINT} (autumn.config.ts:`,
			);
			expect((none as Error).message).not.toContain("catalogV2");

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		${paidMonthly({ planId: free, amount: 0 })}
		${proVersion({ slug: "v1", active: true })}
		${proVersion({ slug: "v2", active: true })}
	],
}`,
				}),
			);
			const two = await scenario.push().catch((thrown) => thrown as Error);
			expect(two).toBeInstanceOf(Error);
			expect((two as Error).message).toContain(
				`Plan "${pro}" has 2 versions and 2 are active. ${ACTIVE_HINT} (autumn.config.ts:`,
			);

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.find((row) => row.id === pro)).toBeUndefined();

			// The wire `atmn()` would have built for the first config, sent raw.
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
				`Cannot set active to false on plan "${pro}": no version of it is active in this update. Exactly one version of each plan must be active: true.`,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
