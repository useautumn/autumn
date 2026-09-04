/**
 * atmn crud/plans/rename — rename one plan (single version) `pro → proNew` → same row, one alias `pro → proNew` (listAliases); real `billing.attach` with the old id lands on proNew, with the new id works; catalog get by the old id rewrites to proNew
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { listAliases } from "../../../../catalog-v2/plans/utils/planAliasTestUtils.js";

/** The single live row's internal_id — renames address a row by this, never by plan_id. */
const activeInternalId = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<string> => {
	const [product] = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
	});
	if (!product) throw new Error(`No plan row for ${planId}`);
	return product.internal_id;
};

test.concurrent(
	`${chalk.yellowBright("rename one plan (single version) `pro → proNew` → same row, one alias `pro → proNew` (listAliases); real `billing.attach` with the old id lands on proNew, with the new id works; catalog get by the old id rewrites to proNew")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: "atmn_rename_single@autumn.test" }),
				s.otherCustomers([
					{ id: "cus_old_id", paymentMethod: "success" },
					{ id: "cus_new_id", paymentMethod: "success" },
				]),
			],
			config: `{
	plans: [
		plan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			const internalId = await activeInternalId({
				ctx: scenario.ctx,
				planId: "pro",
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "proNew", internalId: "${internalId}", name: "Pro" }),
	],
}`,
				}),
			);
			await scenario.push();

			// Same row: the version count under proNew is still exactly one.
			expect(
				await ProductService.listFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					inIds: ["proNew"],
					returnAll: true,
				}),
			).toHaveLength(1);

			const aliases = await listAliases({
				ctx: scenario.ctx,
				planIds: ["pro", "proNew"],
			});
			expect(
				aliases.map((row) => ({
					aliasId: row.alias_id,
					canonicalPlanId: row.canonical_plan_id,
				})),
			).toEqual([{ aliasId: "pro", canonicalPlanId: "proNew" }]);

			await scenario.attachCustomer({
				planId: "pro",
				customerId: "cus_old_id",
			});
			await expectCustomerProducts({
				customerId: "cus_old_id",
				autumn: scenario.autumnV2_3,
				active: ["proNew"],
			});

			await scenario.attachCustomer({
				planId: "proNew",
				customerId: "cus_new_id",
			});
			await expectCustomerProducts({
				customerId: "cus_new_id",
				autumn: scenario.autumnV2_3,
				active: ["proNew"],
			});

			const viaOldId = await scenario.autumnV2_3.products.get<ApiPlanV1>("pro");
			expect(viaOldId.id).toBe("proNew");
		} finally {
			scenario.cleanup();
		}
	},
);
