import { expect, spyOn, test } from "bun:test";
import {
	customerEntitlements,
	MigrationRunStatus,
	migrationBatchResults,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { and, eq, inArray, sql } from "drizzle-orm";
import { addCustomerEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import * as insertOperation from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/insertCustomerEntitlementRows.js";
import * as candidateSelection from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/selectAddCandidateRows.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { createAddRepointRecoveryScenario } from "../../utils/createAddRepointRecoveryScenario";

// Retry must recover all seven changes while only inserting the unfinished batches.
// Run alone: the insert spy throws inside batch 6's real SQL transaction.
test("add batch recovery: resume at batch 6 after five committed batches", async () => {
	const { pageInput } = await createAddRepointRecoveryScenario({
		customerId: "add-batch-recovery",
		customerCount: 7,
	});
	const { ctx, migrationRunId, customers, plan } = pageInput;
	const internalCustomerIds = customers.map((customer) => customer.internalId);
	const [patch] = plan.patches;
	const operationId = `${migrationRunId}:add-dashboard`;
	const addInput = {
		db: ctx.db,
		scope: patch.scope,
		internalCustomerIds,
		fromProduct: patch.fromProduct,
		add: patch.addEntitlementOps[0],
		now: Date.now(),
		candidateRowBatchSize: 1,
		operationId,
	};
	const readDashboardRows = () =>
		ctx.db
			.select({
				id: customerEntitlements.id,
				customerProductId: customerEntitlements.customer_product_id,
			})
			.from(customerEntitlements)
			.where(
				and(
					inArray(
						customerEntitlements.internal_customer_id,
						internalCustomerIds,
					),
					eq(customerEntitlements.feature_id, TestFeature.Dashboard),
				),
			);
	const originalInsert = insertOperation.insertCustomerEntitlementRows;
	let insertAttempts = 0;
	const insertSpy = spyOn(
		insertOperation,
		"insertCustomerEntitlementRows",
	).mockImplementation(async (input) => {
		insertAttempts++;
		const insertedIds = await originalInsert(input);
		if (insertAttempts === 6)
			throw new Error("Batch 6 interrupted before commit");
		return insertedIds;
	});
	const selectSpy = spyOn(candidateSelection, "selectAddCandidateRows");
	try {
		expect(customers).toHaveLength(7);
		await expect(addCustomerEntitlementsForPage(addInput)).rejects.toThrow(
			"Batch 6 interrupted before commit",
		);
		const committedRows = await readDashboardRows();
		expect(committedRows).toHaveLength(5);
		expect(insertSpy).toHaveBeenCalledTimes(6);
		insertSpy.mockClear();
		selectSpy.mockClear();

		const recovered = await addCustomerEntitlementsForPage(addInput);
		expect(insertSpy).toHaveBeenCalledTimes(2);
		const completedRows = await readDashboardRows();
		expect(completedRows).toHaveLength(7);
		expect(completedRows).toEqual(expect.arrayContaining(committedRows));
		expect(recovered.insertedItems).toHaveLength(7);
		expect(recovered.affected).toBe(7);
		expect(recovered.candidateCount).toBe(7);
		expect(completedRows.map((row) => row.customerProductId).sort()).toEqual(
			recovered.insertedItems.map((item) => item.customerProductId).sort(),
		);
		// Two unfinished batches plus the empty batch that closes the iteration.
		expect(selectSpy).toHaveBeenCalledTimes(3);
		insertSpy.mockClear();
		selectSpy.mockClear();

		const replayed = await addCustomerEntitlementsForPage(addInput);
		expect(replayed).toEqual(recovered);
		expect(selectSpy).not.toHaveBeenCalled();
		expect(insertSpy).not.toHaveBeenCalled();
		await expect(
			addCustomerEntitlementsForPage({ ...addInput, now: addInput.now + 1 }),
		).rejects.toThrow("different input");
		expect(insertSpy).not.toHaveBeenCalled();
	} finally {
		insertSpy.mockRestore();
		selectSpy.mockRestore();
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
