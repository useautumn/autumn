import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { getFeatures } from "@tests/setup/v2Features.js";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { getMigrationDb } from "@/trigger/migrations/getMigrationDb.js";
import { generateId } from "@/utils/genUtils.js";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

/** A loopback PgBouncer (transaction mode) in front of a migrated Autumn
 * schema; never the app's DATABASE_URL. */
const bouncerDatabaseUrl = (): string | undefined => {
	const url = process.env.MIGRATION_TEST_BOUNCER_DATABASE_URL;
	if (!url) return undefined;
	return LOOPBACK_HOSTS.includes(new URL(url).hostname) ? url : undefined;
};

const databaseUrl = bouncerDatabaseUrl();

describe.skipIf(!databaseUrl)("migration db factory through PgBouncer", () => {
	test("a pool-level statement_timeout is rejected at startup with 08P01", async () => {
		const { db, client } = initDrizzle({
			databaseUrl,
			maxConnections: 1,
			poolConfig: { statement_timeout: 1000 },
		});
		try {
			const error = await db
				.execute(sql`select 1`)
				.catch((error: unknown) => error);
			expect((error as { code?: string }).code).toBe("08P01");
		} finally {
			await client.end();
		}
	});

	test("getMigrationDb builds the chunk task's org+features context", async () => {
		process.env.DATABASE_URL = databaseUrl;
		const db = getMigrationDb();
		const orgId = generateId("org");
		await OrgService.create({
			db,
			id: orgId,
			slug: `migration-db-factory-${orgId}`,
			name: "Migration DB factory",
			createdBy: "migration-db-factory-test",
		});
		try {
			await FeatureService.insert({
				db,
				data: Object.values(getFeatures({ orgId })),
				logger,
			});
			const orgWithFeatures = await getOrgWithFeaturesCached({
				db,
				orgId,
				env: AppEnv.Sandbox,
				skipCache: true,
			});
			expect(orgWithFeatures?.org.id).toBe(orgId);
			expect(orgWithFeatures?.features.length).toBeGreaterThan(0);
		} finally {
			await db.execute(sql`delete from features where org_id = ${orgId}`);
			await db.execute(sql`delete from organizations where id = ${orgId}`);
		}
	});
});
