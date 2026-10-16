import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { balanceCandidateBackendFor } from "@/internal/customers/balanceCandidates/getBalanceCandidateSource.js";
import { createPostgresBalanceCandidateSource } from "@/internal/customers/balanceCandidates/postgres/createPostgresBalanceCandidateSource.js";
import { postgresBalanceTotalsCte } from "@/internal/customers/balanceCandidates/postgres/postgresBalanceTotalsSql.js";
import {
	POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS,
	runThrottledPostgresQuery,
} from "@/internal/customers/balanceCandidates/postgres/runThrottledPostgresQuery.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("balance candidate backend selection", () => {
	test("production always selects MotherDuck, token or not", () => {
		for (const motherDuckConfigured of [true, false]) {
			expect(
				balanceCandidateBackendFor({
					nodeEnv: "production",
					motherDuckConfigured,
				}),
			).toBe("motherduck");
		}
	});

	test("non-production without a MotherDuck token selects Postgres", () => {
		for (const nodeEnv of ["development", "test", undefined]) {
			expect(
				balanceCandidateBackendFor({ nodeEnv, motherDuckConfigured: false }),
			).toBe("postgres");
		}
	});

	test("a configured MotherDuck token keeps local runs on MotherDuck", () => {
		expect(
			balanceCandidateBackendFor({
				nodeEnv: "development",
				motherDuckConfigured: true,
			}),
		).toBe("motherduck");
	});

	test("the Postgres source refuses to be constructed in production", () => {
		process.env.NODE_ENV = "production";
		expect(() => createPostgresBalanceCandidateSource()).toThrow(
			"must never run in production",
		);
	});

	test("the Postgres source is exact, small-paged and available outside production", () => {
		process.env.NODE_ENV = "development";
		const source = createPostgresBalanceCandidateSource();
		expect(source.backend).toBe("postgres");
		expect(source.ranksExactly).toBe(true);
		expect(source.isAvailable()).toBe(true);
		expect(source.maxPageSize).toBeLessThanOrEqual(50);
		expect(source.nominationBatchSize).toBeLessThanOrEqual(100);
	});
});

describe("postgres balance totals", () => {
	test("scopes totals to org, env, feature, search and filters before ranking", () => {
		const { sql: query, params } = dialect.sqlToQuery(
			postgresBalanceTotalsCte({
				orgId: "org_target",
				env: AppEnv.Sandbox,
				internalFeatureId: "feature_target",
				search: "acme",
				filters: { created_at_range: { start: 1_000 } },
			}),
		);
		const normalized = normalize(query);

		expect(normalized).toContain('"customers"."org_id" = $');
		expect(normalized).toContain('"customers"."env" = $');
		expect(normalized).toContain('"customers"."id" ILIKE $');
		expect(normalized).toContain('"customers"."created_at" >= $');
		expect(normalized).not.toContain('"customers"."created_at" <=');
		expect(params).toContain("%acme%");
		expect(normalized).toContain("WHERE ce.internal_feature_id = $");
		expect(normalized).toContain("ce.pooled_contribution_id IS NULL");
		expect(normalized).toContain(
			"granted_total - total + unlimited_used AS usage_total",
		);
		expect(params).toContain("org_target");
		expect(params).toContain(AppEnv.Sandbox);
		expect(params).toContain("feature_target");
	});
});

describe("throttled postgres candidate queries", () => {
	const createFakeDb = () => {
		const statements: string[] = [];
		const active = new Map<string, number>();
		let maxActivePerOrg = 0;
		let maxActiveOverall = 0;
		let activeOverall = 0;

		const db = {
			transaction: async (run: (tx: unknown) => Promise<unknown>) =>
				run({
					execute: async (query: SQL) => {
						const rendered = dialect.sqlToQuery(query);
						statements.push(rendered.sql);
						if (rendered.sql.startsWith("SET LOCAL")) return { rows: [] };

						const orgId = String(rendered.params[0]);
						active.set(orgId, (active.get(orgId) ?? 0) + 1);
						activeOverall++;
						maxActivePerOrg = Math.max(maxActivePerOrg, active.get(orgId) ?? 0);
						maxActiveOverall = Math.max(maxActiveOverall, activeOverall);
						await new Promise((resolve) => setTimeout(resolve, 20));
						active.set(orgId, (active.get(orgId) ?? 1) - 1);
						activeOverall--;
						return { rows: [{ orgId }] };
					},
				}),
		} as unknown as DrizzleCli;

		return {
			db,
			statements,
			stats: () => ({ maxActivePerOrg, maxActiveOverall }),
		};
	};

	const queryFor = (orgId: string) => sql`SELECT ${orgId} AS org_id`;

	test("sets a transaction-scoped statement_timeout before the query", async () => {
		const { db, statements } = createFakeDb();
		const rows = await runThrottledPostgresQuery<{ orgId: string }>({
			db,
			orgId: "org_a",
			query: queryFor("org_a"),
		});

		expect(rows).toEqual([{ orgId: "org_a" }]);
		expect(statements[0]).toBe(
			`SET LOCAL statement_timeout = ${POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS}`,
		);
	});

	test("runs one query at a time per org, but orgs proceed independently", async () => {
		const { db, stats } = createFakeDb();
		await Promise.all(
			["org_a", "org_a", "org_a", "org_b", "org_b"].map((orgId) =>
				runThrottledPostgresQuery({ db, orgId, query: queryFor(orgId) }),
			),
		);

		expect(stats().maxActivePerOrg).toBe(1);
		expect(stats().maxActiveOverall).toBe(2);
	});

	test("a failed query does not block the org's next query", async () => {
		const { db } = createFakeDb();
		const failingDb = {
			transaction: async () => {
				throw new Error("canceling statement due to statement timeout");
			},
		} as unknown as DrizzleCli;

		await expect(
			runThrottledPostgresQuery({
				db: failingDb,
				orgId: "org_c",
				query: queryFor("org_c"),
			}),
		).rejects.toThrow("statement timeout");
		expect(
			await runThrottledPostgresQuery({
				db,
				orgId: "org_c",
				query: queryFor("org_c"),
			}),
		).toEqual([{ orgId: "org_c" }]);
	});
});
