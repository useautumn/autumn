/**
 * atmn scenarios/lint — two rows of one plan where one lacks versionSlug
 *
 * Once a plan has versions, a slug-less row stops meaning "the v1"; lint
 * refuses with the exact message and file:line, and nothing is sent.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/lint: a plan with two rows where only one states versionSlug fails lint before any request")}`,
	async () => {
		const pro = uniqueTestId("atmn_pro");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		${paidMonthly({ planId: pro, amount: 30, extra: `\n\t\t\tversionSlug: "v2",` })}
	],
	planVersions: [
		${paidMonthly({ planId: pro, amount: 20 })}
	],
}`,
		});

		try {
			const error = await scenario.push().catch((thrown) => thrown as Error);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				`Plan "${pro}" has 2 versions but only 1 states versionSlug. Add versionSlug to every version so they can be told apart. (autumn.config.ts:`,
			);
			expect((error as Error).message).not.toContain("catalogV2");

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.find((row) => row.id === pro)).toBeUndefined();
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/lint: a variant declared under two versions where one entry lacks versionSlug fails lint before any request")}`,
	async () => {
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;
		const variantEntry = (slug?: string) => `
			variants: [
				{
					variantPlanId: "${proYearly}",
					name: "Pro Yearly",${slug ? `\n\t\t\t\t\tversionSlug: "${slug}",` : ""}
					customize: { price: { amount: 200, interval: "year" } },
				},
			],`;
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		${paidMonthly({ planId: pro, amount: 30, extra: `\n\t\t\tversionSlug: "v2",${variantEntry("v2")}` })}
	],
	planVersions: [
		${paidMonthly({ planId: pro, amount: 20, extra: `\n\t\t\tversionSlug: "v1",${variantEntry()}` })}
	],
}`,
		});

		try {
			const error = await scenario.push().catch((thrown) => thrown as Error);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				`Variant "${proYearly}" is declared under 2 versions of "${pro}" but only 1 states versionSlug. Add versionSlug to every version so they can be told apart. (autumn.config.ts:`,
			);

			const catalog = (await scenario.client.get({})) as unknown as {
				plans: Array<{ id: string }>;
			};
			expect(catalog.plans.find((row) => row.id === pro)).toBeUndefined();
		} finally {
			scenario.cleanup();
		}
	},
);
