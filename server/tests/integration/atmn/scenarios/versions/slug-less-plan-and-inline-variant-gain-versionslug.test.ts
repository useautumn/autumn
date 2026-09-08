/**
 * atmn scenarios/versions — versionSlug is effectively mandatory
 *
 * A plan and an inline variant pushed without slugs both gain `versionSlug:
 * "v1"` on disk, and a pull into a fresh dir states a slug on every plan row
 * and every nested variant entry: the CLI never leaves a fixture slug-less.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: push writes versionSlug into a slug-less plan and its inline variant, and a fresh pull states slugs everywhere")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const pro = uniqueTestId("atmn_pro");
		const proYearly = `${pro}_yearly`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	features: [
		feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "${messages}", included: 100, reset: { interval: "month" } }],
			variants: [
				{
					variantPlanId: "${proYearly}",
					name: "Pro Yearly",
					customize: { price: { amount: 200, interval: "year" } },
				},
			],
		}),
	],
}`,
		});

		try {
			const pushed = await scenario.push();
			expect(pushed.output).toContain(`+ ${pro}@v1`);
			expect(pushed.output).toContain(`+ ${proYearly}@v1`);
			expect(pushed.output).toContain("versionSlug into 2 fixtures");

			const source = readFileSync(scenario.configPath, "utf8");
			// The plan's slug lands after its last property; the variant's after its own.
			expect(source).toContain('\t\t\t],\n\t\t\tversionSlug: "v1",\n\t\t}),');
			expect(source).toContain('\t\t\t\t\tversionSlug: "v1",\n\t\t\t\t},');
			expect(source.match(/versionSlug: "v1"/g)).toHaveLength(2);

			const { freshFiles } = await expectRoundTrip({ scenario });
			const pulled = [...freshFiles.values()].join("\n");
			expect(pulled).toContain(`planId: "${pro}"`);
			expect(pulled).toContain(`variantPlanId: "${proYearly}"`);
			// One slug per row: the plan and its nested variant entry.
			expect(pulled.match(/versionSlug: "v1"/g)).toHaveLength(2);
		} finally {
			scenario.cleanup();
		}
	},
);
