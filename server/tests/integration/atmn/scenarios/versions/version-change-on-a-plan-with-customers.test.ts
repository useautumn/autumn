import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

const internalIdForVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}): Promise<string> => {
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	return full.internal_id;
};

const activeCustomerCount = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}): Promise<number> => {
	const rows = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_product_id, internalProductId),
				eq(customerProducts.status, CusProductStatus.Active),
			),
		);
	return rows.length;
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/versions: an in-place price change on a customered version drafts a migration and leaves the customer where they are")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ plans: [${paidMonthly({ planId: "pro", amount: 20, extra: `\n\t\t\t\tversionSlug: "v1",` })}] }`,
		});

		try {
			await scenario.push();
			await scenario.seedCustomer({ planId: "pro", version: 1 });

			const internalId = await internalIdForVersion({
				ctx: scenario.ctx,
				planId: "pro",
				version: 1,
			});
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: internalId,
				}),
			).toBe(1);

			scenario.writeConfig(
				atmnConfigSource({
					body: `{ plans: [${paidMonthly({ planId: "pro", amount: 25, extra: `\n\t\t\t\tversionSlug: "v1",` })}] }`,
				}),
			);
			const applied = await scenario.push();

			expect(applied.migrationIds).not.toHaveLength(0);
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: internalId,
				}),
			).toBe(1);
		} finally {
			scenario.cleanup();
		}
	},
);
