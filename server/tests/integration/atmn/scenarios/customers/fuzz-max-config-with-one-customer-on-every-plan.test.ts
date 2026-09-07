/**
 * atmn scenarios/customers — fuzz-max config with one customer on every plan → push succeeds, migrations drafted only for in-place edits
 *
 * real `billing.attach` first; the point is to hit the dependency errors
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { seedVersionableCustomer } from "@tests/integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	freePlan,
	paidMonthly,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const proItems = `
					{ featureId: "messages", included: 100, reset: { interval: "month" } },`;

/** free, paid pro, a seat license, and an enterprise plan that licenses it —
 * one customer lands on each; only `pro`'s price changes between pushes. */
const plansBlock = ({ proAmount }: { proAmount: number }): string =>
	`${freePlan}${paidMonthly({ amount: proAmount, items: proItems })}${seatPlan}${enterpriseWithSeats({ included: 25 })}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: a fuzz-max config with a customer on every plan pushes cleanly, drafting migrations only for the plan edited in place")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: plansBlock({ proAmount: 49 }),
			}),
		});

		try {
			await scenario.push();

			// One real attach through billing (the paid plan customers use), one
			// seeded customer per remaining plan (cheap, no Stripe needed).
			await scenario.attachCustomer({ planId: "pro" });
			await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId: "free",
				version: 1,
			});
			await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId: "seat",
				version: 1,
			});
			await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId: "enterprise",
				version: 1,
			});

			scenario.writeConfig(
				`${atmnImports()}
export default atmn(${configBody({ features: everyFeatureType, plans: plansBlock({ proAmount: 59 }) })});
`,
			);

			const result = await scenario.push();

			// Push succeeded (no thrown 4xx) and only the customered, in-place-edited
			// plan — `pro` — drafted a migration; free/seat/enterprise are unchanged.
			expect(result.migrationIds, result.output).toHaveLength(1);
		} finally {
			scenario.cleanup();
		}
	},
);
