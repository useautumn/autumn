/** A canceled run, or one whose chunk throws after its page committed, still re-derives is_custom. */

import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts, customers } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { setMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";

type Stop = "canceled" | "chunk_failed";

const STOPS: Stop[] = ["canceled", "chunk_failed"];

for (const stop of STOPS) {
	test.concurrent(
		`${chalk.yellowBright(`migration is_custom (batch, ${stop}): committed pages are re-derived`)}`,
		async () => {
			const id = `mig-is-custom-${stop.replace("_", "-")}`;
			const plan = products.base({
				id: `${id}-plan`,
				items: [
					items.dashboard(),
					items.monthlyMessages({ includedUsage: 200 }),
				],
			});
			const { ctx, autumnV2_2 } = await initScenario({
				customerId: id,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.attach({ productId: plan.id })],
			});

			const readIsCustom = async () => {
				const [row] = await ctx.db
					.select({ isCustom: customerProducts.is_custom })
					.from(customerProducts)
					.innerJoin(
						customers,
						eq(customerProducts.internal_customer_id, customers.internal_id),
					)
					.where(
						and(
							eq(customers.org_id, ctx.org.id),
							eq(customers.env, ctx.env),
							eq(customers.id, id),
							eq(customerProducts.product_id, plan.id),
							eq(customerProducts.status, CusProductStatus.Active),
						),
					);
				return row?.isCustom;
			};
			expect(await readIsCustom()).toBe(false);

			const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
				id: `${id}-mig-${Date.now().toString(36)}`,
				filter: { customer: { plan: { plan_id: plan.id } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id },
							customize: {
								remove_items: [{ feature_id: TestFeature.Messages }],
								add_items: [itemsV2.monthlyMessages({ included: 100 })],
							},
						},
					],
				},
				no_billing_changes: true,
			});

			const run = runMigrationInChunks({
				ctx,
				migration,
				migrationRunId: generateId("mrun"),
				dryRun: false,
				runBatchChunk: async (payload) => {
					const chunkResult = await runBatchMigrationChunk({
						ctx,
						migration: payload.migration,
						migrationRunId: payload.migrationRunId,
						plan: payload.plan,
						afterInternalId: payload.cursor,
						maxPages: 1,
						webhooks: payload.webhooks,
						controls: payload.controls,
					});
					if (stop === "chunk_failed") {
						throw new Error("chunk failed after its page committed");
					}
					await setMigrationCancelRequested({
						ctx,
						migrationRunId: payload.migrationRunId,
					});
					return chunkResult;
				},
			});

			if (stop === "chunk_failed") {
				await expect(run).rejects.toThrow(
					"chunk failed after its page committed",
				);
			} else {
				expect((await run).lane).toBe("batch");
			}
			expect(await readIsCustom()).toBe(true);
		},
	);
}
