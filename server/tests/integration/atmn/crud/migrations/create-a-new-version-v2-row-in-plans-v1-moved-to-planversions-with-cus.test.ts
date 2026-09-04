/**
 * atmn crud/migrations — create a new version [v2 row in plans, v1 moved to planVersions] with customers on v1 → no migration, customers stay on v1, v2 active
 *
 * the `versionedPro` base config: base price, prepaid seat item, usage item, trial, seat license; every line has customers attached
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import { seedVersionableCustomer } from "@tests/integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

/** Every live `pro` version row, oldest first, with its internal id. */
const liveProVersions = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<
	Array<{ version: number; active: boolean; internalId: string }>
> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: ["pro"],
		returnAll: true,
	});
	return products
		.map((product) => ({
			version: product.version,
			active: product.active,
			internalId: product.internal_id,
		}))
		.sort((a, b) => a.version - b.version);
};

/** Active customer_products rows currently on a plan version's internal id. */
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
	`${chalk.yellowBright("atmn crud/migrations: minting a new version drafts nothing for customers left on the old one")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: everyFeatureType,
				plans: versionedPro({ versionSlug: "v1" }),
			}),
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();
			await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId: "pro",
				version: 1,
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({ versionSlug: "v2", amount: 59 }),
						planVersions: versionedPro({ versionSlug: "v1" }),
					}),
				}),
			);
			const result = await runPush({ client, cwd: scenario.cwd });

			// Minting a version is not an in-place edit, so nothing warrants a draft.
			expect(result.preview.migrations ?? []).toEqual([]);
			expect(result.migrationIds).toEqual([]);

			const versions = await liveProVersions({ ctx: scenario.ctx });
			expect(versions).toEqual([
				expect.objectContaining({ version: 1, active: false }),
				expect.objectContaining({ version: 2, active: true }),
			]);

			const [v1, v2] = versions;
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: v1.internalId,
				}),
			).toBe(1);
			expect(
				await activeCustomerCount({
					ctx: scenario.ctx,
					internalProductId: v2.internalId,
				}),
			).toBe(0);
		} finally {
			scenario.cleanup();
		}
	},
);
