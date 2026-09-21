import { expect, spyOn, test } from "bun:test";
import {
	type CheckResponseV3,
	MigrationItemRunStatus,
	WebhookEventType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import * as redisRouting from "@/external/redis/customerRedisRouting.js";
import * as subscriptions from "@/external/svix/subscriptions/index.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/withMigrationRunClaim.js";
import {
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import * as webhookQueue from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";
import { createRedisFaultProxy } from "../../utils/createRedisFaultProxy";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";
import { readRepointableCustomerPlanRow } from "../version-repoint/utils/versionRepointTestUtils";

// Real DB, Redis, claims and runner; webhook subscription/dispatch are fixtures.
// Run this file in its own worker because Redis routing is intercepted here.
for (const versionFiltered of [false, true]) {
	test(`batch cache recovery: ${versionFiltered ? "original version filter" : "stable customer filter"} retries committed customers`, async () => {
		const stem = `cache-recovery-${crypto.randomUUID().slice(0, 8)}`;
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const migration = await autumnV2_3.migrationsV2.deleteAndCreate({
			id: `${stem}-migration`,
			filter: {
				customer: {
					plan: {
						plan_id: plan.id,
						...(versionFiltered ? { version: 1 } : {}),
					},
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1, custom: false },
						version: 2,
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			no_billing_changes: true,
		});
		const before = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(before.allowed).toBe(false);
		const redis = redisRouting.resolveCustomerRedisRouting({
			org: ctx.org,
			customerId,
		}).redis;
		const subjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		});
		const cachedBefore = await redis.get(subjectKey);
		expect(cachedBefore).not.toBeNull();
		const fault = await createRedisFaultProxy({ redis });
		const pipelineSpy = spyOn(fault.client, "pipeline");
		const subscriptionSpy = spyOn(
			subscriptions,
			"isSubscribedToEvents",
		).mockResolvedValue([WebhookEventType.BillingUpdated]);
		const queued: { runId: string; customers: string[] }[] = [];
		const routeSpy = spyOn(
			redisRouting,
			"getRedisTargetsForCustomer",
		).mockReturnValue([fault.client]);
		const queueSpy = spyOn(
			webhookQueue,
			"queueMigrationWebhooks",
		).mockImplementation(async ({ migrationRunId, records }) => {
			queued.push({
				runId: migrationRunId,
				customers: records.map((record) => record.customerId),
			});
			return 1;
		});
		try {
			const claim = async () =>
				withMigrationRunClaim({
					ctx,
					migration,
					dryRun: false,
					claimed: async () => undefined,
				});
			const first = await claim();
			fault.block();
			await expect(
				runMigrationInChunks({
					ctx,
					migration,
					migrationRunId: first.migrationRunId,
					dryRun: false,
					controls: { webhooks: { sendWebhooks: true } },
				}),
			).rejects.toThrow("cache invalidation did not complete for 1 page(s)");
			expect(pipelineSpy).toHaveBeenCalledTimes(6);
			expect(fault.getDroppedBytes()).toBeGreaterThan(0);
			const committedRow = await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			});
			const committedPlan = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});
			expect(committedPlan.version).toBe(2);
			expect(await redis.get(subjectKey)).toBe(cachedBefore);
			await expectMigrationItemRunStatus({
				ctx,
				migrationInternalId: migration.internal_id,
				migrationRunId: first.migrationRunId,
				customerId,
				status: MigrationItemRunStatus.Failed,
			});
			const [failedRun] = await migrationRunRepo.list({
				ctx,
				internalId: first.migrationRunId,
			});
			expect(failedRun.status).toBe("failed");
			expect(queued).toEqual([
				{ runId: first.migrationRunId, customers: [customerId] },
			]);

			await fault.recover();
			const retry = await claim();
			const preparedMigration = await migrationRepo.find({
				ctx,
				id: migration.id,
			});
			const result = await runMigrationInChunks({
				ctx,
				migration: preparedMigration,
				migrationRunId: retry.migrationRunId,
				dryRun: false,
				controls: {
					retryItemStatuses: [MigrationItemRunStatus.Failed],
					webhooks: { sendWebhooks: true },
				},
			});
			const [retryRun] = await migrationRunRepo.list({
				ctx,
				internalId: retry.migrationRunId,
			});
			const cachedAfterRetry = await redis.get(subjectKey);
			const afterRow = await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			});
			console.log("cache recovery observation", {
				versionFiltered,
				firstStatus: failedRun.status,
				retryStatus: retryRun.status,
				lane: result.lane,
				processed: result.processed,
				cacheStillPresent: cachedAfterRetry !== null,
				sameEntitlementRow: afterRow.id === committedRow.id,
				webhookBatches: queued.length,
			});
			expect(result.lane).toBe("batch");
			expect(afterRow.id).toBe(committedRow.id);
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Dashboard,
				count: 1,
			});
			expect(
				cachedAfterRetry === null,
				"retry must clear the committed customer's old cache",
			).toBe(true);
			await expectMigrationItemRunStatus({
				ctx,
				migrationInternalId: migration.internal_id,
				migrationRunId: retry.migrationRunId,
				customerId,
				status: MigrationItemRunStatus.Skipped,
			});
			expect(result.processed).toBe(1);
			expect(retryRun.status).toBe("no_changes");
			expect(queued).toHaveLength(1);
			const after = await autumnV2_3.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Dashboard,
			});
			expect(after.allowed).toBe(true);
		} finally {
			pipelineSpy.mockRestore();
			subscriptionSpy.mockRestore();
			routeSpy.mockRestore();
			queueSpy.mockRestore();
			await fault.close();
		}
	}, 90_000);
}
