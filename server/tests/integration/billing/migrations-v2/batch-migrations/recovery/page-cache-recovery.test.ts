import { expect, spyOn, test } from "bun:test";
import {
	type CheckResponseV3,
	MigrationRunStatus,
	migrationBatchResults,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { and, eq, sql } from "drizzle-orm";
import * as redisRouting from "@/external/redis/customerRedisRouting.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import * as insertOperation from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/insertCustomerEntitlementRows.js";
import { listScopedInternalCustomerIds } from "@/internal/migrations/v2/batchOperations/actions/listScopedInternalCustomerIds/listScopedInternalCustomerIds.js";
import * as repointOperation from "@/internal/migrations/v2/batchOperations/actions/repointCustomerProductsForPage/repointCustomerProductRows.js";
import * as pageExecution from "@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
import { invalidateBatchMigrationCaches } from "@/internal/migrations/v2/batchOperations/finalize/invalidateBatchMigrationCaches.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { createAddRepointRecoveryScenario } from "../../utils/createAddRepointRecoveryScenario";
import { createRedisFaultProxy } from "../../utils/createRedisFaultProxy";
import { readScopedFeatureRow } from "../paidRowTestUtils";
import { readRepointableCustomerPlanRow } from "../version-repoint/utils/versionRepointTestUtils";

// Real SQL and Redis; retry the same serialized page after cache invalidation fails.
// Run alone: Redis routing is intercepted on a private fault-proxy connection.
test("page cache recovery: original execution clears stale cache without repeating SQL", async () => {
	const { autumnV2_3, customerId, planId, pageInput } =
		await createAddRepointRecoveryScenario({
			customerId: "page-cache-recovery",
		});
	const { ctx, ...originalPage } = pageInput;
	const originalPayload = JSON.stringify({
		...originalPage,
		recovery: { pageId: "page-1", effectiveAt: Date.now() },
	});
	const redis = redisRouting.resolveCustomerRedisRouting({
		org: ctx.org,
		customerId,
	}).redis;
	const subjectKey = buildFullSubjectKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	const before = await autumnV2_3.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
	});
	expect(before.allowed).toBe(false);
	const cachedBefore = await redis.get(subjectKey);
	expect(cachedBefore).not.toBeNull();
	const fault = await createRedisFaultProxy({ redis });
	const routeSpy = spyOn(
		redisRouting,
		"getRedisTargetsForCustomer",
	).mockReturnValue([fault.client]);
	const insertSpy = spyOn(insertOperation, "insertCustomerEntitlementRows");
	const repointSpy = spyOn(repointOperation, "repointCustomerProductRows");
	const pageSpy = spyOn(pageExecution, "executeBatchMigrationPage");
	// Round-trip the payload so each attempt uses fresh objects with the original values.
	const retryOriginalPage = async () => {
		const pageResult = await pageExecution.executeBatchMigrationPage({
			ctx,
			...JSON.parse(originalPayload),
		});
		await invalidateBatchMigrationCaches({ ctx, pageResult });
		return pageResult;
	};
	try {
		fault.block();
		await expect(retryOriginalPage()).rejects.toThrow(
			"FullSubject batch invalidation dropped 1 of 1 subjects after 5 attempts",
		);
		expect(fault.getDroppedBytes()).toBeGreaterThan(0);
		const committedDashboard = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
		});
		const committedPlan = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId,
		});
		expect(committedPlan.version).toBe(2);
		expect(await redis.get(subjectKey)).toBe(cachedBefore);
		const scopedCustomerIds = await listScopedInternalCustomerIds({
			db: ctx.db,
			internalCustomerIds: originalPage.customers.map(
				(customer) => customer.internalId,
			),
			scopes: originalPage.plan.patches.map((patch) => patch.scope),
		});
		expect(scopedCustomerIds.size).toBe(0);
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(1);
		const firstCall = pageSpy.mock.results[0];
		if (firstCall.type !== "return")
			throw new Error("Expected SQL page to finish before cache failure");
		const committedResult = await firstCall.value;
		expect(committedResult.insertedItems).toHaveLength(1);
		expect(committedResult.repointedProducts).toHaveLength(1);

		await fault.recover();
		const recovered = await retryOriginalPage();
		expect(
			await redis.get(subjectKey),
			"retry must clear the original customer's stale cache",
		).toBeNull();
		expect(recovered).toEqual(committedResult);
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(1);
		const dashboardAfterRetry = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Dashboard,
		});
		expect(dashboardAfterRetry.id).toBe(committedDashboard.id);

		expect(await retryOriginalPage()).toEqual(committedResult);
		expect(await redis.get(subjectKey)).toBeNull();
		expect(insertSpy).toHaveBeenCalledTimes(1);
		expect(repointSpy).toHaveBeenCalledTimes(1);
		for (const [input] of pageSpy.mock.calls) {
			const { ctx: _context, ...retriedPage } = input;
			expect(retriedPage).toEqual(JSON.parse(originalPayload));
		}
		const after = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(after.allowed).toBe(true);
	} finally {
		routeSpy.mockRestore();
		insertSpy.mockRestore();
		repointSpy.mockRestore();
		pageSpy.mockRestore();
		await fault.close();
		await ctx.db
			.delete(migrationBatchResults)
			.where(
				and(
					eq(migrationBatchResults.org_id, ctx.org.id),
					eq(migrationBatchResults.env, ctx.env),
					sql`strpos(${migrationBatchResults.batch_id}, ${originalPage.migrationRunId}) > 0`,
				),
			);
		await migrationRunRepo.update({
			ctx,
			internalId: originalPage.migrationRunId,
			updates: {
				status: MigrationRunStatus.Failed,
				finished_at: Date.now(),
				error_message:
					"SQL/cache recovery test ended without webhook finalization",
			},
		});
	}
}, 90_000);
