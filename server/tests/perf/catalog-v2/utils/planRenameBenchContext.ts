/**
 * Dedicated DEV-DB org for the catalogV2 plan-rename execute CTE.
 *
 *   bun tests/perf/catalog-v2/benchExecuteRenamePlans.ts
 *
 * Loads server/.env.local (worktree / local DEV) — never staging/prod.
 * Org slug is ephemeral (`bench-rename-txn-*`) and deleted after the run.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	type Organization,
} from "@autumn/shared";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

const SERVER_DIR = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../../..",
);

const PROD_DB_REGION = "us-east-2";
const DEV_DB_REGION = "eu-west-2";
const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1"];
const FORBIDDEN_HOST_RE = /staging|prod|planetscale|amazonaws/i;

export const PLAN_RENAME_BENCH_ENV = AppEnv.Sandbox;
export const PLAN_RENAME_BENCH_PLAN_ID = "pro";
export const PLAN_RENAME_BENCH_TO_ID = "proNew";
export const PLAN_RENAME_BENCH_ORG_PREFIX = "bench-rename-txn-";

export const PLAN_RENAME_BENCH_VERSIONS = 100;
export const PLAN_RENAME_BENCH_REWARD_PROGRAMS = 20;
export const PLAN_RENAME_BENCH_REWARDS = 20;
export const PLAN_RENAME_BENCH_CUSTOMER_PRODUCTS = 3;

const loadWorktreeDevEnv = () => {
	const envFile = process.env.ENV_FILE ?? "";
	if (/staging|prod/i.test(envFile)) {
		throw new Error(
			`bench: refusing ENV_FILE=${envFile} — this script is DEV/local only`,
		);
	}

	const envLocalPath = resolve(SERVER_DIR, ".env.local");
	if (!existsSync(envLocalPath)) {
		throw new Error(
			"bench: server/.env.local missing — need the worktree/local DEV DATABASE_URL",
		);
	}

	const loaded = config({ path: envLocalPath, override: true });
	if (!loaded.parsed?.DATABASE_URL && !process.env.DATABASE_URL) {
		throw new Error("bench: DATABASE_URL missing in server/.env.local");
	}
};

export type SafeDatabaseTarget = {
	hostname: string;
	database: string;
};

export const describeDatabaseUrl = (url: string): SafeDatabaseTarget => {
	try {
		const parsed = new URL(url);
		return {
			hostname: parsed.hostname,
			database: parsed.pathname.replace(/^\//, "") || "<none>",
		};
	} catch {
		throw new Error(
			"bench: DATABASE_URL is unset or unparseable — expected server/.env.local",
		);
	}
};

/** Print host/db (no password) and abort unless this is the DEV/local Neon. */
export const assertBenchDatabaseSafe = (): SafeDatabaseTarget => {
	loadWorktreeDevEnv();
	const target = describeDatabaseUrl(process.env.DATABASE_URL ?? "");
	console.log(`bench: DB host=${target.hostname} db=${target.database}`);

	if (target.hostname.includes(PROD_DB_REGION)) {
		throw new Error(
			`bench: refusing to run against a prod DATABASE_URL (${target.hostname})`,
		);
	}
	if (
		FORBIDDEN_HOST_RE.test(target.hostname) &&
		!target.hostname.includes(DEV_DB_REGION)
	) {
		throw new Error(
			`bench: refusing staging/prod-looking host ${target.hostname}`,
		);
	}
	if (
		/prod|staging/i.test(target.database) &&
		target.database !== "neondb"
	) {
		throw new Error(
			`bench: refusing database name ${target.database} (looks like staging/prod)`,
		);
	}
	if (
		!target.hostname.includes(DEV_DB_REGION) &&
		!LOCAL_DB_HOSTS.includes(target.hostname)
	) {
		throw new Error(
			`bench: expected the dev DB (${DEV_DB_REGION}) or a local DB, but DATABASE_URL points at ${target.hostname}`,
		);
	}

	return target;
};

export type PlanRenameBenchDb = {
	db: ReturnType<typeof initDrizzle>["db"];
	client: ReturnType<typeof initDrizzle>["client"];
};

export type PlanRenameBenchContext = {
	ctx: AutumnContext;
	org: Organization;
};

export const openPlanRenameBenchDb = (): PlanRenameBenchDb => {
	assertBenchDatabaseSafe();
	return initDrizzle({ maxConnections: 2, name: "plan-rename-bench" });
};

export const createPlanRenameBenchContext = async ({
	db,
	orgSlug,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	orgSlug: string;
}): Promise<PlanRenameBenchContext> => {
	const org = await OrgService.create({
		db,
		id: generateId("org"),
		slug: orgSlug,
		name: "Plan Rename Txn Bench",
		createdBy: "plan-rename-txn-bench",
	});

	const ctx: AutumnContext = {
		org,
		env: PLAN_RENAME_BENCH_ENV,
		features: [],
		db,
		dbGeneral: db,
		logger,
		redisV2: resolveRedisV2(),
		id: generateId("bench"),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		expand: [],
		extraLogs: {},
	};

	return { ctx, org };
};

/** customer_products → products has no ON DELETE CASCADE. */
export const deletePlanRenameBenchOrg = async ({
	db,
	orgId,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	orgId: string;
}) => {
	await db.execute(sql`
		DELETE FROM customer_products
		WHERE internal_customer_id IN (
			SELECT internal_id FROM customers WHERE org_id = ${orgId}
		)
	`);
	await OrgService.delete({ db, orgId });
};

export const deleteLeftoverRenameBenchOrgs = async ({
	db,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
}) => {
	const leftovers = await db.execute<{ id: string; slug: string }>(sql`
		SELECT id, slug
		FROM organizations
		WHERE slug LIKE ${`${PLAN_RENAME_BENCH_ORG_PREFIX}%`}
	`);
	for (const row of leftovers) {
		console.log(`bench: deleting leftover org ${row.slug}`);
		await deletePlanRenameBenchOrg({ db, orgId: row.id });
	}
};

export const hasProductAliasesTable = async ({
	db,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
}): Promise<boolean> => {
	const [row] = await db.execute<{ exists: boolean }>(sql`
		SELECT to_regclass('public.product_aliases') IS NOT NULL AS exists
	`);
	return Boolean(row?.exists);
};

/** Apply 0068 on this already-verified DEV connection only. */
export const ensureProductAliasesTable = async ({
	db,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
}) => {
	if (await hasProductAliasesTable({ db })) return;

	console.log(
		"bench: product_aliases missing — applying 0068_petite_bug on this DEV connection",
	);
	await db.execute(`
		CREATE TABLE "product_aliases" (
			"org_id" text NOT NULL,
			"env" text NOT NULL,
			"alias_id" text NOT NULL,
			"canonical_plan_id" text NOT NULL,
			"created_at" numeric DEFAULT ROUND(date_part('epoch', NOW()) * 1000)::BIGINT NOT NULL,
			CONSTRAINT "product_aliases_pkey" PRIMARY KEY("org_id","env","alias_id"),
			CONSTRAINT "product_aliases_canonical_unique" UNIQUE("org_id","env","canonical_plan_id")
		)
	`);
	await db.execute(`
		ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_org_id_fkey"
		FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
		ON DELETE cascade ON UPDATE no action
	`);
};
