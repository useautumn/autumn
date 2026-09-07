/**
 * atmn crud/plans/rename — rename only the active version, history rows keep the old planId → assert what the server does (versions share a planId)
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
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

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
	`${chalk.yellowBright("rename only the active version, history rows keep the old planId → assert what the server does (versions share a planId)")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		plan({ planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "pro", versionSlug: "v2", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
	planVersions: [
		plan({ planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
				}),
			);
			await scenario.push();

			const [v1, v2] = await livePlanVersions({
				ctx: scenario.ctx,
				planId: "pro",
			});

			// Only the active row (v2) is addressed by internalId; v1 is not
			// mentioned in this push at all.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "proNew", internalId: "${v2.internalId}", name: "Pro" }),
	],
}`,
				}),
			);
			await scenario.push();

			// Decision pending: a rename executes as `UPDATE products SET id = ...
			// WHERE id = <old plan_id>`, which matches every row sharing that
			// plan_id — so history rows are swept along even though only the
			// active row's internalId was addressed. "Versions share a planId" is
			// not just documentation; a rename cannot leave that invariant broken.
			expect(
				await ProductService.listFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					inIds: ["pro"],
					returnAll: true,
				}),
			).toEqual([]);
			const afterRename = await livePlanVersions({
				ctx: scenario.ctx,
				planId: "proNew",
			});
			expect(afterRename.map((row) => row.internalId).sort()).toEqual(
				[v1.internalId, v2.internalId].sort(),
			);
		} finally {
			scenario.cleanup();
		}
	},
);
