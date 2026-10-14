import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { listAliases } from "../../../../catalog-v2/plans/utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("rename without internalId → not a rename: a new plan is created and the old one archived, no alias")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "pro", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			const originalPro = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "pro",
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "proNew", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
	],
}`,
				}),
			);
			await scenario.push();

			const pro = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "pro",
				allowNotFound: true,
			});
			const proNew = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "proNew",
			});
			expect(pro).toBeNull();
			expect(proNew.internal_id).not.toBe(originalPro.internal_id);

			const aliases = await listAliases({
				ctx: scenario.ctx,
				planIds: ["pro", "proNew"],
			});
			expect(aliases).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
