import { expect, spyOn, test } from "bun:test";
import {
	MigrationItemRunStatus,
	MigrationRunStatus,
	migrationBatchResults,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { and, eq, sql } from "drizzle-orm";
import * as addOperation from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import * as insertOperation from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/insertCustomerEntitlementRows.js";
import * as repointSql from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsForPage/repointCustomerProductsForPage.js";
import * as pageMarks from "@/internal/migrations/v2/batchOperations/execute/claim/index.js";
import { executeBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { createAddRepointRecoveryScenario } from "../../utils/createAddRepointRecoveryScenario";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";
import {
	expectCustomerPlanRepointedInPlace,
	readRepointableCustomerPlanRow,
} from "../version-repoint/utils/versionRepointTestUtils";

// Interrupt both sides of the repoint commit; retry must recover the original changes.
// Run alone: spies interrupt the real executor before repoint and before item marks.
test("add-repoint recovery: retry retains the addition committed before interruption", async () => {
	const {
		customerId,
		planId,
		pageInput: originalPage,
	} = await createAddRepointRecoveryScenario();
	const pageInput = {
		...originalPage,
		recovery: { pageId: "page-1", effectiveAt: Date.now() },
	};
	const { ctx, migrationInternalId, migrationRunId } = pageInput;
	const addSpy = spyOn(addOperation, "addCustomerEntitlementsForPage");
	const insertSpy = spyOn(insertOperation, "insertCustomerEntitlementRows");
	const repointSpy = spyOn(
		repointSql,
		"repointCustomerProductsForPage",
	).mockRejectedValueOnce(new Error("Interrupted before version update"));
	const marksSpy = spyOn(pageMarks, "markPageItemRuns");

	try {
		expect(pageInput.customers).toHaveLength(1);
		await expect(executeBatchMigrationPage(pageInput)).rejects.toThrow(
			"Interrupted before version update",
		);
		expect(repointSpy).toHaveBeenCalledTimes(1);
		expect(addSpy).toHaveBeenCalledTimes(1);
		const firstAddCall = addSpy.mock.results[0];
		if (firstAddCall.type !== "return")
			throw new Error("Expected the addition to commit before interruption");
		const committedAddition = await firstAddCall.value;
		expect(committedAddition.insertedItems).toHaveLength(1);
		const committedDashboard = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
		});
		const interruptedPlan = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId,
		});
		expect(interruptedPlan.version).toBe(1);
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Running,
		});

		marksSpy.mockRejectedValueOnce(
			new Error("Interrupted after version update"),
		);
		await expect(executeBatchMigrationPage(pageInput)).rejects.toThrow(
			"Interrupted after version update",
		);
		const committedPlan = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId,
		});
		expect(committedPlan.version).toBe(2);
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Running,
		});
		marksSpy.mockRestore();
		// Preserve the original selection and plan; retry must not prepare or select again.
		const retryResult = await executeBatchMigrationPage(pageInput);
		const completedPlan = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId,
		});
		expectCustomerPlanRepointedInPlace({
			before: interruptedPlan,
			after: completedPlan,
			targetVersion: 2,
		});
		const dashboardAfterRetry = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
		});
		expect(dashboardAfterRetry.id).toBe(committedDashboard.id);
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId,
			featureId: TestFeature.Dashboard,
			count: 1,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
		expect(retryResult.succeeded).toEqual(pageInput.customers);
		expect(retryResult.repointedProducts).toHaveLength(1);
		expect(
			retryResult.insertedItems,
			"retry must retain the original Dashboard change for finalization",
		).toEqual(committedAddition.insertedItems);
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(2);

		const replayResult = await executeBatchMigrationPage(pageInput);
		expect(replayResult).toEqual(retryResult);
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(2);
		expect(addSpy).toHaveBeenCalledTimes(4);
		const savedResults = await ctx.db
			.select()
			.from(migrationBatchResults)
			.where(
				and(
					eq(migrationBatchResults.org_id, ctx.org.id),
					eq(migrationBatchResults.env, ctx.env),
					sql`strpos(${migrationBatchResults.batch_id}, ${migrationRunId}) > 0`,
				),
			);
		expect(savedResults).toHaveLength(2);
		expect(savedResults.map((saved) => saved.version)).toEqual([2, 2]);
		expect(savedResults.map((saved) => saved.result?.format).sort()).toEqual([
			"compact-add-v1",
			"compact-repoint-v1",
		]);
		const firstAddInput = addSpy.mock.calls[0][0];
		expect(firstAddInput.operationId).toEqual(expect.any(String));
		for (const [addInput] of addSpy.mock.calls) {
			expect(addInput.operationId).toBe(firstAddInput.operationId);
			expect(addInput.now).toBe(pageInput.recovery.effectiveAt);
		}
		const changedPageInput = {
			...pageInput,
			recovery: {
				...pageInput.recovery,
				effectiveAt: pageInput.recovery.effectiveAt + 1,
			},
		};
		await expect(executeBatchMigrationPage(changedPageInput)).rejects.toThrow(
			"different input",
		);
		const [patch] = pageInput.plan.patches;
		await expect(
			executeBatchMigrationPage({
				...pageInput,
				plan: {
					patches: [
						{ ...patch, removeEntitlementOps: [{ by: "filter", from: {} }] },
					],
				},
			}),
		).rejects.toThrow("only add and repoint");
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(2);
	} finally {
		addSpy.mockRestore();
		insertSpy.mockRestore();
		marksSpy.mockRestore();
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
