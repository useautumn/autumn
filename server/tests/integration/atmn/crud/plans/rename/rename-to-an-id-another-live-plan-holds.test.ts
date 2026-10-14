import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
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
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "pro", name: "Pro", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
		plan({ active: true, planId: "enterprise", name: "Enterprise", versionSlug: "v1", price: { amount: 999, interval: "month" } }),
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
		plan({ active: true, planId: "enterprise", internalId: "${internalId}", name: "Pro", versionSlug: "v1", }),
	],
}`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow();

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
