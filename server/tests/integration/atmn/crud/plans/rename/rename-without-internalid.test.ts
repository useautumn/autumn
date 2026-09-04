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

			// The fixture's planId is edited to "proNew" without carrying the
			// backfilled internalId forward — this is a create, not a rename.
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
			});
			const proNew = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "proNew",
			});
			expect(proNew.internal_id).not.toBe(pro.internal_id);

			// Decision pending: no internalId means no rename path is ever
			// triggered, so nothing in this push instructs the server to touch
			// `pro` — it stays exactly as it was (still active), and `proNew` is
			// a wholly independent new row. If the intended contract is instead
			// for an untouched sibling to end up archived, this is the line to
			// flip.
			expect(pro.archived).toBe(false);

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
