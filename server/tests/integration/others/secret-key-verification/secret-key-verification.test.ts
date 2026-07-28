import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MigrationRunStatus, migrationRuns } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import { verifyKey } from "@/internal/dev/apiKeys/actions/verifyKey.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { clearSecretKeyCache } from "@/internal/dev/apiKeys/cacheApiKeyUtils.js";
import {
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";

const MIGRATION_ID = "secret-key-verification-test-migration";

describe("secret-key-verification: verifyKey shape (DB + cache)", () => {
	const hashedKey = hashApiKey(ctx.orgSecretKey);

	const cleanupDbState = async () => {
		// Remove any active lazy/background runs we might leave behind on
		// re-runs. The FK on migrations.internal_id → migration_runs cascades,
		// but we delete by id-scoped to org/env so we have to do it explicitly.
		await ctx.db
			.delete(migrationRuns)
			.where(
				and(
					eq(migrationRuns.org_id, ctx.org.id),
					eq(migrationRuns.env, ctx.env),
				),
			);

		await migrationRepo.delete({ ctx, id: MIGRATION_ID }).catch(() => null);
	};

	beforeAll(async () => {
		await cleanupDbState();
		await clearSecretKeyCache({ hashedKey });
	});

	afterAll(async () => {
		await cleanupDbState();
		await clearSecretKeyCache({ hashedKey });
	});

	test("loads org + features with no pending migrations on first call (DB)", async () => {
		const data = await verifyKey({
			db: ctx.db,
			key: ctx.orgSecretKey,
		});

		expect(data).not.toBeNull();
		if (!data) throw new Error("verifyKey returned no data");

		expect(data.org.id).toBe(ctx.org.id);
		expect(data.env).toBe(ctx.env);
		expect(Array.isArray(data.features)).toBe(true);
		expect(data.features.length).toBe(ctx.features.length);
		expect(data.pendingMigrations).toEqual([]);
		expect(data.org.pendingMigrations).toEqual([]);
	});

	test("second call returns identical shape from cache", async () => {
		const data = await verifyKey({
			db: ctx.db,
			key: ctx.orgSecretKey,
		});

		if (!data) throw new Error("verifyKey returned no data");

		expect(data.org.id).toBe(ctx.org.id);
		expect(data.features.length).toBe(ctx.features.length);
		expect(data.pendingMigrations).toEqual([]);
		expect(data.org.pendingMigrations).toEqual([]);
	});

	test("after seeding a lazy migration_run, pendingMigrations surfaces it (DB + cache)", async () => {
		const migration = await migrationRepo.insert({
			ctx,
			insert: {
				id: MIGRATION_ID,
				filter: null,
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: "noop" },
							version: 1,
						},
					],
				},
			},
		});

		const run = await migrationRunRepo.insert({
			ctx,
			insert: {
				migration_internal_id: migration.internal_id,
				dry_run: false,
				lazy_run: true,
			},
		});
		expect(run).not.toBeNull();
		if (!run) throw new Error("failed to insert lazy migration_run");

		// Bust the cached payload so verifyKey re-loads from DB.
		await clearSecretKeyCache({ hashedKey });

		const fromDb = await verifyKey({ db: ctx.db, key: ctx.orgSecretKey });
		if (!fromDb) throw new Error("verifyKey returned no data");

		expect(fromDb.pendingMigrations).toHaveLength(1);
		expect(fromDb.pendingMigrations[0]?.internal_id).toBe(run.internal_id);
		expect(fromDb.pendingMigrations[0]?.lazy_run).toBe(true);
		const status = fromDb.pendingMigrations[0]?.status;
		expect(
			status === MigrationRunStatus.Queued ||
				status === MigrationRunStatus.Running,
		).toBe(true);
		expect(fromDb.pendingMigrations[0]?.migration.id).toBe(MIGRATION_ID);
		expect(fromDb.org.pendingMigrations).toHaveLength(1);
		expect(fromDb.org.pendingMigrations?.[0]?.migration.id).toBe(MIGRATION_ID);

		// Second call hits cache — should be the same shape (deep-equal).
		const fromCache = await verifyKey({ db: ctx.db, key: ctx.orgSecretKey });
		if (!fromCache) throw new Error("verifyKey returned no cached data");

		expect(fromCache.pendingMigrations).toEqual(fromDb.pendingMigrations);
		expect(fromCache.org.pendingMigrations).toEqual(
			fromDb.org.pendingMigrations,
		);
	});

	test("non-lazy (background) runs do not surface on pendingMigrations", async () => {
		// Wipe state, seed a fresh migration with a background-mode run.
		await cleanupDbState();
		await clearSecretKeyCache({ hashedKey });

		const migration = await migrationRepo.insert({
			ctx,
			insert: {
				id: MIGRATION_ID,
				filter: null,
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: "noop" },
							version: 1,
						},
					],
				},
			},
		});

		const run = await migrationRunRepo.insert({
			ctx,
			insert: {
				migration_internal_id: migration.internal_id,
				dry_run: false,
				lazy_run: false,
			},
		});
		expect(run).not.toBeNull();

		const data = await verifyKey({
			db: ctx.db,
			key: ctx.orgSecretKey,
		});

		expect(data?.pendingMigrations).toEqual([]);
		expect(data?.org.pendingMigrations).toEqual([]);
	});
});
