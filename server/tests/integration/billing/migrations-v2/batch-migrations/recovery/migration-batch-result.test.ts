import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import {
	customerProducts,
	migrationBatchResults,
	products as productTable,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { repointCustomerProductRows } from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsForPage/repointCustomerProductRows.js";
import { compactToRepointBatchResult } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/compactToRepointBatchResult.js";
import { repointBatchResultToCompact } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/repointBatchResultToCompact.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { withMigrationBatchResult } from "@/internal/migrations/v2/repos/migrationBatchResult/withMigrationBatchResult.js";
import { readRepointableCustomerPlanRow } from "../version-repoint/utils/versionRepointTestUtils";

const batchIds: string[] = [];
const setup = async () => {
	const stem = `batch-result-${crypto.randomUUID().slice(0, 8)}`;
	const customerId = `${stem}-customer`;
	const plan = products.base({
		id: `${stem}-plan`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	for (const included of [200, 300])
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included })],
		});
	const versions = await ctx.db
		.select()
		.from(productTable)
		.where(
			and(
				eq(productTable.org_id, ctx.org.id),
				eq(productTable.env, ctx.env),
				eq(productTable.id, plan.id),
			),
		);
	const versionId = (version: number) => {
		const product = versions.find((product) => product.version === version);
		if (!product) throw new Error(`Missing version ${version}`);
		return product.internal_id;
	};
	const row = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId: plan.id,
	});
	const [customerProduct] = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, row.id));
	return {
		ctx,
		row,
		customerProduct,
		fromId: versionId(1),
		toId: versionId(2),
		laterId: versionId(3),
	};
};
let fixture: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
	fixture = await setup();
});
beforeEach(async () => {
	await fixture.ctx.db
		.update(customerProducts)
		.set({ internal_product_id: fixture.fromId })
		.where(eq(customerProducts.id, fixture.row.id));
});
afterAll(async () => {
	if (fixture && batchIds.length > 0)
		await fixture.ctx.db
			.delete(migrationBatchResults)
			.where(
				and(
					eq(migrationBatchResults.org_id, fixture.ctx.org.id),
					inArray(migrationBatchResults.batch_id, batchIds),
				),
			);
});

const originalInput = () => ({
	version: 1,
	customerIds: [fixture.customerProduct.internal_customer_id],
	fromId: fixture.fromId,
	toId: fixture.toId,
});
const mutate = async ({ ctx }: { ctx: { db: DrizzleCli } }) => ({
	changes: await repointCustomerProductRows({
		db: ctx.db,
		internalCustomerIds: [fixture.customerProduct.internal_customer_id],
		scope: buildOperationScope({ internalProductId: fixture.fromId }),
		toInternalProductId: fixture.toId,
	}),
});
const newBatchId = () => {
	const id = `batch-${crypto.randomUUID()}`;
	batchIds.push(id);
	return id;
};
const currentProduct = async () => {
	const [row] = await fixture.ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, fixture.row.id));
	return row.internal_product_id;
};

test("migration batch result: replay returns original changes without overwriting later work", async () => {
	const batchId = newBatchId();
	const first = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery: {
			orgId: fixture.ctx.org.id,
			env: fixture.ctx.env,
			batchId,
			input: originalInput(),
		},
		execute: mutate,
	});
	expect(first.changes).toHaveLength(1);
	await fixture.ctx.db
		.update(customerProducts)
		.set({ internal_product_id: fixture.laterId })
		.where(eq(customerProducts.id, fixture.row.id));
	let replayed = false;
	const replay = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery: {
			orgId: fixture.ctx.org.id,
			env: fixture.ctx.env,
			batchId,
			input: originalInput(),
		},
		execute: async (args) => {
			replayed = true;
			return mutate(args);
		},
	});
	expect(replay).toEqual(first);
	expect(replayed).toBe(false);
	expect(await currentProduct()).toBe(fixture.laterId);
	await expect(
		withMigrationBatchResult({
			ctx: fixture.ctx,
			recovery: {
				orgId: fixture.ctx.org.id,
				env: fixture.ctx.env,
				batchId,
				input: { ...originalInput(), toId: fixture.laterId },
			},
			execute: mutate,
		}),
	).rejects.toThrow("different input");
});

test("migration batch result: concurrent attempts execute the mutation once", async () => {
	const batchId = newBatchId();
	let executions = 0;
	const execute = async (args: { ctx: { db: DrizzleCli } }) => {
		executions++;
		await args.ctx.db.execute(sql`SELECT pg_sleep(0.1)`);
		return mutate(args);
	};
	const [first, second] = await Promise.all(
		[0, 1].map(() =>
			withMigrationBatchResult({
				ctx: fixture.ctx,
				recovery: {
					orgId: fixture.ctx.org.id,
					env: fixture.ctx.env,
					batchId,
					input: originalInput(),
				},
				execute,
			}),
		),
	);
	expect(executions).toBe(1);
	expect(first.changes).toHaveLength(1);
	expect(second).toEqual(first);
});

test("migration batch result: failure rolls back both mutation and receipt", async () => {
	const batchId = newBatchId();
	await expect(
		withMigrationBatchResult({
			ctx: fixture.ctx,
			recovery: {
				orgId: fixture.ctx.org.id,
				env: fixture.ctx.env,
				batchId,
				input: originalInput(),
			},
			execute: async (args) => {
				await mutate(args);
				throw new Error("Injected before result persistence");
			},
		}),
	).rejects.toThrow("Injected before result persistence");
	expect(await currentProduct()).toBe(fixture.fromId);
	const receipts = await fixture.ctx.db
		.select()
		.from(migrationBatchResults)
		.where(eq(migrationBatchResults.batch_id, batchId));
	expect(receipts).toHaveLength(0);
	const retry = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery: {
			orgId: fixture.ctx.org.id,
			env: fixture.ctx.env,
			batchId,
			input: originalInput(),
		},
		execute: mutate,
	});
	expect(retry.changes).toHaveLength(1);
	expect(await currentProduct()).toBe(fixture.toId);
});

test("migration batch result: compact storage restores original results and reads legacy receipts", async () => {
	const batchId = newBatchId();
	const toStored = mock(repointBatchResultToCompact);
	const fromStored = mock(compactToRepointBatchResult);
	const recovery = {
		orgId: fixture.ctx.org.id,
		env: fixture.ctx.env,
		batchId,
		input: originalInput(),
		resultStorage: { toStored, fromStored },
	};
	// One real SQL mutation, with a synthetic 5,000-row result to check storage size.
	const execute = mock(async (args: { ctx: { db: DrizzleCli } }) => {
		const { changes } = await mutate(args);
		return {
			rows: Array.from({ length: 5_000 }, () => ({
				...changes[0],
				customerProductId: crypto.randomUUID(),
				internalCustomerId: crypto.randomUUID(),
			})),
		};
	});
	const first = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery,
		execute,
	});
	expect(first.rows).toHaveLength(5_000);
	expect(toStored).toHaveBeenCalledTimes(1);
	expect(fromStored).not.toHaveBeenCalled();
	const [saved] = await fixture.ctx.db
		.select({
			version: migrationBatchResults.version,
			result: migrationBatchResults.result,
			compactBytes: sql<number>`pg_column_size(${migrationBatchResults.result}::text::jsonb)`,
			fullBytes: sql<number>`pg_column_size(${JSON.stringify(first)}::jsonb)`,
		})
		.from(migrationBatchResults)
		.where(eq(migrationBatchResults.batch_id, batchId));
	expect(saved.version).toBe(2);
	expect(saved.result?.format).toBe("compact-repoint-v1");
	expect(saved.compactBytes).toBeLessThan(saved.fullBytes);
	const replay = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery,
		execute,
	});
	expect(replay).toEqual(first);
	expect(execute).toHaveBeenCalledTimes(1);
	expect(toStored).toHaveBeenCalledTimes(1);
	expect(fromStored).toHaveBeenCalledTimes(1);

	await fixture.ctx.db
		.update(migrationBatchResults)
		.set({ version: 1, result: first })
		.where(eq(migrationBatchResults.batch_id, batchId));
	const legacy = await withMigrationBatchResult({
		ctx: fixture.ctx,
		recovery,
		execute,
	});
	expect(legacy).toEqual(first);
	expect(fromStored).toHaveBeenCalledTimes(1);
	await fixture.ctx.db
		.update(migrationBatchResults)
		.set({ version: 99 })
		.where(eq(migrationBatchResults.batch_id, batchId));
	await expect(
		withMigrationBatchResult({ ctx: fixture.ctx, recovery, execute }),
	).rejects.toThrow("unsupported migration batch result");
	expect(execute).toHaveBeenCalledTimes(1);
});

test("migration batch result: storage conversion failure rolls back SQL and receipt", async () => {
	const batchId = newBatchId();
	const recovery = {
		orgId: fixture.ctx.org.id,
		env: fixture.ctx.env,
		batchId,
		input: originalInput(),
		resultStorage: {
			toStored: () => {
				throw new Error("Injected storage conversion failure");
			},
			fromStored: ({
				result,
			}: {
				result: Awaited<ReturnType<typeof mutate>>;
			}) => result,
		},
	};
	await expect(
		withMigrationBatchResult({ ctx: fixture.ctx, recovery, execute: mutate }),
	).rejects.toThrow("Injected storage conversion failure");
	expect(await currentProduct()).toBe(fixture.fromId);
	const saved = await fixture.ctx.db
		.select()
		.from(migrationBatchResults)
		.where(eq(migrationBatchResults.batch_id, batchId));
	expect(saved).toHaveLength(0);
});
