/**
 * atmn scenarios/customers — rename a planId with internalId while customers are on it → customers follow the row
 *
 * real `billing.attach` first; the point is to hit the dependency errors
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const catalogConfig = ({ planId }: { planId: string }): string => `{
	plans: [
		{
			planId: "${planId}",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			createInStripe: false,
		},
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/customers: renaming a planId by its internalId while customers are on it carries them along")}`,
	async () => {
		const oldPlanId = uniqueTestId("atmn_cus_rename_old");
		const newPlanId = uniqueTestId("atmn_cus_rename_new");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer({ paymentMethod: "success" }),
			],
			config: catalogConfig({ planId: oldPlanId }),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId: oldPlanId });

			// Backfills internalId onto the fixture, without which changing
			// planId would read as a create + archive rather than a rename.
			await scenario.pull();

			const configBefore = scenario.files().get("autumn.config.ts") as string;
			expect(configBefore).toContain("internalId:");
			const configAfter = configBefore.replace(
				`planId: "${oldPlanId}"`,
				`planId: "${newPlanId}"`,
			);
			scenario.writeConfig(configAfter);

			await scenario.push();

			const [product] = await ProductService.listFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				inIds: [newPlanId],
				returnAll: true,
			});
			expect(product).toEqual(
				expect.objectContaining({ id: newPlanId, version: 1, active: true }),
			);

			const customer = await scenario.autumnV2_3.customers.get(
				scenario.customerId as unknown as string,
			);
			expect(customer.products?.[0]?.id).toBe(newPlanId);
		} finally {
			scenario.cleanup();
		}
	},
);
