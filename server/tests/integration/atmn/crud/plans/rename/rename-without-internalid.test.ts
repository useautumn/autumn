/**
 * atmn crud/plans/rename — rename without internalId → not a rename: a new plan is created and the old one archived, no alias
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
					userEmail: "atmn_rename_no_internal_id@autumn.test",
				}),
			],
			config: `{
	plans: [
		plan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
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

			// The fixture's planId is edited to "proNew" without carrying the
			// backfilled internalId forward — this is a create, not a rename. A
			// push restates the whole catalog (skip_deletions: false) and "pro"
			// is no longer in it, so with no customers or rewards keeping it
			// around, the server removes it outright — the old id is not
			// reserved as an alias either.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "proNew", name: "Pro", price: { amount: 49, interval: "month" } }),
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
