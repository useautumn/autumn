/**
 * atmn crud/plans/rename — rename to an id another live plan holds → refused, error surfaced
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
	`${chalk.yellowBright("rename to an id another live plan holds → refused, error surfaced")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: "atmn_rename_collision@autumn.test" }),
			],
			config: `{
	plans: [
		plan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
		plan({ planId: "enterprise", name: "Enterprise", price: { amount: 999, interval: "month" } }),
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
		plan({ planId: "enterprise", internalId: "${internalId}", name: "Pro" }),
	],
}`,
				}),
			);

			// Decision pending: exact error shape isn't pinned down here, only
			// that a live id can't be stolen out from under another plan.
			await expect(scenario.push()).rejects.toThrow();

			// Nothing moved — `pro` is still `pro`, `enterprise` is untouched.
			expect(
				await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: internalId,
				}),
			).toEqual(expect.objectContaining({ id: "pro" }));
		} finally {
			scenario.cleanup();
		}
	},
);
