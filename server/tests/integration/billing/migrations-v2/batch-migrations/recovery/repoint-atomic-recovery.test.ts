import { expect, spyOn, test } from "bun:test";
import {
	customerProducts,
	MigrationRunStatus,
	migrationBatchResults,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as repointSql from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsForPage/repointCustomerProductRows.js";
import { executeBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { createAddRepointRecoveryScenario } from "../../utils/createAddRepointRecoveryScenario";

// Repoint remains one SQL update: failure rolls back every customer together.
// Run alone: the SQL spy throws after the update, before the helper commits.
test("repoint recovery: preserves atomicity with and without saved results", async () => {
	const { pageInput } = await createAddRepointRecoveryScenario({
		customerId: "repoint-atomic-recovery",
		customerCount: 3,
	});
	const { ctx, migrationRunId, customers, plan } = pageInput;
	const [patch] = plan.patches;
	const internalCustomerIds = customers.map((customer) => customer.internalId);
	const readProducts = () =>
		ctx.db
			.select({
				id: customerProducts.id,
				internalProductId: customerProducts.internal_product_id,
			})
			.from(customerProducts)
			.where(
				inArray(customerProducts.internal_customer_id, internalCustomerIds),
			)
			.orderBy(customerProducts.id);
	const originalRepoint = repointSql.repointCustomerProductRows;
	const repointSpy = spyOn(repointSql, "repointCustomerProductRows");
	try {
		for (const recovery of [
			undefined,
			{ pageId: "page-1", effectiveAt: Date.now() },
		]) {
			await ctx.db
				.update(customerProducts)
				.set({ internal_product_id: patch.scope.internalProductId })
				.where(
					inArray(customerProducts.internal_customer_id, internalCustomerIds),
				);
			const before = await readProducts();
			expect(before).toHaveLength(3);
			let rowsUpdatedBeforeFailure = 0;
			repointSpy.mockClear();
			repointSpy.mockImplementationOnce(async (input) => {
				const rows = await originalRepoint(input);
				rowsUpdatedBeforeFailure = rows.length;
				throw new Error("Interrupted before repoint commit");
			});
			const executionInput = { ...pageInput, recovery };
			await expect(executeBatchMigrationPage(executionInput)).rejects.toThrow(
				"Interrupted before repoint commit",
			);
			expect(rowsUpdatedBeforeFailure).toBe(3);
			expect(await readProducts()).toEqual(before);
			expect(repointSpy).toHaveBeenCalledTimes(1);
			const recovered = await executeBatchMigrationPage(executionInput);
			expect(repointSpy).toHaveBeenCalledTimes(2);
			expect(recovered.succeeded).toEqual(customers);
			expect(
				recovered.repointedProducts?.map((row) => row.customerProductId),
			).toEqual(before.map((row) => row.id));
			expect(await readProducts()).toEqual(
				before.map((row) => ({
					...row,
					internalProductId: patch.repointCustomerProduct!.toInternalProductId,
				})),
			);
			if (recovery) {
				expect(await executeBatchMigrationPage(executionInput)).toEqual(
					recovered,
				);
				expect(repointSpy).toHaveBeenCalledTimes(2);
			}
		}
	} finally {
		repointSpy.mockRestore();
		await ctx.db
			.delete(migrationBatchResults)
			.where(
				and(
					eq(migrationBatchResults.org_id, ctx.org.id),
					eq(migrationBatchResults.env, ctx.env),
					sql`strpos(${migrationBatchResults.batch_id}, ${migrationRunId}) > 0`,
				),
			);
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: MigrationRunStatus.Failed,
				finished_at: Date.now(),
				error_message: "SQL-only recovery test ended without finalization",
			},
		});
	}
});
