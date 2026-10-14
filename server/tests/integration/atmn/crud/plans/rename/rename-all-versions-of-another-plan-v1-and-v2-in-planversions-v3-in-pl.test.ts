import { expect, test } from "bun:test";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { listAliases } from "../../../../catalog-v2/plans/utils/planAliasTestUtils.js";

const livePlanVersions = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<
	Array<{ internalId: string; version: number; active: boolean }>
> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	return products
		.map((product) => ({
			internalId: product.internal_id,
			version: product.version,
			active: product.active,
		}))
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	`${chalk.yellowBright("rename all versions of another plan [v1 and v2 in planVersions, v3 in plans, every row renamed by its internalId] → one plan renamed across every version, one alias, customers on every version follow, attach by the old id lands on the active version")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
				s.otherCustomers([{ id: "cus_on_old_id", paymentMethod: "success" }]),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v2", name: "Pro", price: { amount: 49, interval: "month" } }),
	
		plan({ active: false, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
				}),
			);
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v3", name: "Pro", price: { amount: 59, interval: "month" } }),
	
		plan({ active: false, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
		plan({ active: false, planId: "pro", versionSlug: "v2", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`,
				}),
			);
			await scenario.push();

			const beforeRename = await livePlanVersions({
				ctx: scenario.ctx,
				planId: "pro",
			});
			expect(beforeRename.map((row) => row.active)).toEqual([
				false,
				false,
				true,
			]);
			const [v1, v2, v3] = beforeRename;

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "proRenamed", versionSlug: "v3", internalId: "${v3.internalId}", name: "Pro" }),
	
		plan({ active: false, planId: "proRenamed", versionSlug: "v1", internalId: "${v1.internalId}", name: "Pro" }),
		plan({ active: false, planId: "proRenamed", versionSlug: "v2", internalId: "${v2.internalId}", name: "Pro" }),
	],
}`,
				}),
			);
			await scenario.push();

			const afterRename = await livePlanVersions({
				ctx: scenario.ctx,
				planId: "proRenamed",
			});
			expect(
				afterRename.map((row) => ({
					version: row.version,
					active: row.active,
				})),
			).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: false },
				{ version: 3, active: true },
			]);
			expect(
				await ProductService.listFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					inIds: ["pro"],
					returnAll: true,
				}),
			).toEqual([]);

			const aliases = await listAliases({
				ctx: scenario.ctx,
				planIds: ["pro", "proRenamed"],
			});
			expect(
				aliases.map((row) => ({
					aliasId: row.alias_id,
					canonicalPlanId: row.canonical_plan_id,
				})),
			).toEqual([{ aliasId: "pro", canonicalPlanId: "proRenamed" }]);

			await scenario.attachCustomer({
				planId: "pro",
				customerId: "cus_on_old_id",
			});
			await expectCustomerProducts({
				customerId: "cus_on_old_id",
				autumn: scenario.autumnV2_3,
				active: ["proRenamed"],
			});
		} finally {
			scenario.cleanup();
		}
	},
);
