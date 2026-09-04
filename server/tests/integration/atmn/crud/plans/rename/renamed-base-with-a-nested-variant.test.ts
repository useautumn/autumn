/**
 * atmn crud/plans/rename — renamed base with a nested variant → variant keeps its own id, attach by the base's old id still resolves
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("renamed base with a nested variant → variant keeps its own id, attach by the base's old id still resolves")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: "atmn_rename_base_with_variant@autumn.test",
				}),
				s.otherCustomers([
					{ id: "cus_on_base_old_id", paymentMethod: "success" },
				]),
			],
			config: `{
	plans: [
		plan({
			planId: "base",
			name: "Base",
			price: { amount: 49, interval: "month" },
			variants: [
				{
					variantPlanId: "addon",
					name: "Addon",
					customize: { price: { amount: 79, interval: "month" } },
				},
			],
		}),
	],
}`,
		});

		try {
			await scenario.push();
			const base = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "base",
			});
			const variantBefore = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "addon",
			});

			// Only the base is renamed. A push is the whole desired catalog
			// (skip_deletions: false), so the nested variant has to be restated
			// too — an omitted `variants` array reads as "remove them", not
			// "leave them alone" — while restating it unchanged leaves the link
			// itself untouched.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			planId: "baseNew",
			internalId: "${base.internal_id}",
			name: "Base",
			variants: [
				{
					variantPlanId: "addon",
					name: "Addon",
					customize: { price: { amount: 79, interval: "month" } },
				},
			],
		}),
	],
}`,
				}),
			);
			await scenario.push();

			const variantAfter = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "addon",
			});
			expect(variantAfter.id).toBe("addon");
			expect(variantAfter.internal_id).toBe(variantBefore.internal_id);
			expect(variantAfter.base_internal_product_id).toBe(base.internal_id);

			await scenario.attachCustomer({
				planId: "base",
				customerId: "cus_on_base_old_id",
			});
			await expectCustomerProducts({
				customerId: "cus_on_base_old_id",
				autumn: scenario.autumnV2_3,
				active: ["baseNew"],
			});
		} finally {
			scenario.cleanup();
		}
	},
);
