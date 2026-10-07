import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { recordNewFailures } from "./refreshBaselines.ts";

const testDatabaseUrl = process.env.TWD_TEST_DATABASE_URL;
const MIGRATION = join(
	import.meta.dir,
	"../../../db/migrations/0011_run_baseline_flag.sql",
);

const at = (minute: number) =>
	new Date(Date.UTC(2026, 9, 6, 12, minute)).toISOString();
const D1 = "1".repeat(40);
const D2 = "2".repeat(40);
const ALL = { groups: ["all"] };

type Run = {
	id: string;
	branch?: string;
	sha?: string;
	pinned_sha?: boolean;
	selection?: { groups: string[]; grep?: string };
	status: string;
	purpose?: string;
	repeat?: number;
	file_count?: number;
	failed: number;
	created_at: string;
	finished_at: string | null;
};

const run = (r: Run) => ({
	branch: "dev",
	sha: D1,
	pinned_sha: false,
	selection: ALL,
	purpose: "adhoc",
	repeat: 1,
	file_count: 100,
	...r,
});

const flaggedRun = (r: Run, isBaseline: boolean) => ({
	...run(r),
	is_baseline: isBaseline,
});

const result = (
	run_id: string,
	file: string,
	status: string,
	attempt = 1,
	minute = 0,
) => ({ run_id, file, status, attempt, created_at: at(minute) });

/** Minimal pre-0011 tables in a throwaway schema; the 0011 migration file then runs against them. */
const withSchema = async (
	fn: (client: postgres.Sql) => Promise<void>,
): Promise<void> => {
	const schemaName = `twd_baseline_${crypto.randomUUID().replaceAll("-", "")}`;
	const admin = postgres(testDatabaseUrl as string, {
		max: 1,
		onnotice: () => {},
	});
	await admin.unsafe(`create schema ${schemaName}`);
	const client = postgres(testDatabaseUrl as string, {
		max: 1,
		onnotice: () => {},
		connection: { search_path: schemaName },
	});
	try {
		await client.unsafe(`
			create table runs (id text primary key, branch text not null, sha text not null, pinned_sha boolean not null, selection jsonb not null, status text not null, purpose text not null, repeat integer not null, file_count integer, failed integer not null, created_at timestamptz not null, finished_at timestamptz);
			create table test_results (run_id text not null, file text not null, status text not null, attempt integer not null, created_at timestamptz not null);
			create table warm_images (sha text primary key, branch text not null, created_at timestamptz not null);
		`);
		await fn(client);
	} finally {
		await client.end();
		await admin.unsafe(`drop schema ${schemaName} cascade`);
		await admin.end();
	}
};

const applyMigration = async (client: postgres.Sql) => {
	for (const statement of (await readFile(MIGRATION, "utf8")).split(
		"--> statement-breakpoint",
	))
		await client.unsafe(statement);
};

const flags = async (client: postgres.Sql) =>
	Object.fromEntries(
		(
			await client<
				{ id: string; is_baseline: boolean; new_failures: number | null }[]
			>`select id, is_baseline, new_failures from runs order by id`
		).map((r) => [r.id, [r.is_baseline, r.new_failures]]),
	);

test.skipIf(!testDatabaseUrl)(
	"0011 backfills baseline flags and new failures against the previous baseline",
	async () => {
		await withSchema(async (client) => {
			await client`insert into warm_images ${client([
				{ sha: D1, branch: "dev", created_at: at(0) },
				{ sha: D2, branch: "dev", created_at: at(20) },
			])}`;
			await client`insert into runs ${client([
				// Scheduled baseline; nothing finished before it, so its 1 failure has no reference.
				run({
					id: "b1_scheduled",
					status: "failed",
					purpose: "baseline",
					failed: 1,
					created_at: at(1),
					finished_at: at(5),
				}),
				// Manual full suite at dev HEAD (D1 newest at t10): a baseline; `a` newly fails.
				run({
					id: "m1_full_head",
					status: "failed",
					failed: 2,
					created_at: at(10),
					finished_at: at(15),
				}),
				// Pinned to D1 after D2 landed: not HEAD, not a baseline.
				run({
					id: "m2_full_stale",
					pinned_sha: true,
					status: "passed",
					failed: 0,
					created_at: at(25),
					finished_at: at(30),
				}),
				// A subset of dev at HEAD: not a baseline.
				run({
					id: "m3_subset",
					selection: { groups: ["core"] },
					file_count: 10,
					status: "passed",
					failed: 0,
					created_at: at(11),
					finished_at: at(12),
				}),
				// Grep over everything is still a subset.
				run({
					id: "m4_grep",
					selection: { groups: ["all"], grep: "attach" },
					status: "passed",
					failed: 0,
					created_at: at(11),
					finished_at: at(12),
				}),
				run({
					id: "f0_before_any",
					branch: "feat/z",
					status: "failed",
					failed: 1,
					created_at: at(2),
					finished_at: at(3),
				}),
				run({
					id: "f1_branch",
					branch: "feat/x",
					status: "failed",
					failed: 2,
					created_at: at(16),
					finished_at: at(18),
				}),
				run({
					id: "f2_green",
					branch: "feat/y",
					status: "passed",
					failed: 0,
					created_at: at(16),
					finished_at: at(18),
				}),
				run({
					id: "r1_repeat",
					branch: "feat/x",
					repeat: 3,
					status: "failed",
					failed: 1,
					created_at: at(16),
					finished_at: at(18),
				}),
				run({
					id: "x_cancelled_baseline",
					purpose: "baseline",
					status: "cancelled",
					failed: 0,
					created_at: at(26),
					finished_at: at(27),
				}),
			])}`;
			await client`insert into test_results ${client([
				result("b1_scheduled", "a.test.ts", "passed"),
				result("b1_scheduled", "b.test.ts", "failed"),
				result("b1_scheduled", "c.test.ts", "failed", 1, 1),
				result("b1_scheduled", "c.test.ts", "passed", 2, 2),
				result("m1_full_head", "a.test.ts", "failed"),
				result("m1_full_head", "b.test.ts", "timed_out"),
				result("m1_full_head", "c.test.ts", "passed"),
				result("f0_before_any", "a.test.ts", "failed"),
				result("f1_branch", "a.test.ts", "failed"),
				result("f1_branch", "d.test.ts", "crashed"),
				result("f1_branch", "c.test.ts", "failed", 1, 1),
				result("f1_branch", "c.test.ts", "passed", 2, 2),
				result("r1_repeat", "a.test.ts", "failed"),
			])}`;

			await applyMigration(client);

			expect(await flags(client)).toEqual({
				b1_scheduled: [true, null],
				f0_before_any: [false, null],
				// vs m1: `a` was already failing there; `d` is new.
				f1_branch: [false, 1],
				f2_green: [false, 0],
				// vs b1: `a` passed there, `b` already failed.
				m1_full_head: [true, 1],
				m2_full_stale: [false, 0],
				m3_subset: [false, 0],
				m4_grep: [false, 0],
				r1_repeat: [false, null],
				x_cancelled_baseline: [true, null],
			});
		});
	},
);

test.skipIf(!testDatabaseUrl)(
	"recordNewFailures compares a finished run with the latest baseline that finished before it",
	async () => {
		await withSchema(async (client) => {
			await applyMigration(client);
			await client`insert into runs ${client([
				flaggedRun(
					{
						id: "old_baseline",
						status: "passed",
						failed: 0,
						created_at: at(0),
						finished_at: at(5),
					},
					true,
				),
				flaggedRun(
					{
						id: "baseline",
						status: "failed",
						failed: 1,
						created_at: at(10),
						finished_at: at(15),
					},
					true,
				),
				flaggedRun(
					{
						id: "later_baseline",
						status: "passed",
						failed: 0,
						created_at: at(30),
						finished_at: at(45),
					},
					true,
				),
				flaggedRun(
					{
						id: "branch_run",
						branch: "feat/x",
						status: "failed",
						failed: 2,
						created_at: at(20),
						finished_at: at(40),
					},
					false,
				),
			])}`;
			await client`insert into test_results ${client([
				result("baseline", "b.test.ts", "failed"),
				result("baseline", "a.test.ts", "passed"),
				result("branch_run", "a.test.ts", "failed"),
				result("branch_run", "b.test.ts", "failed"),
				result("branch_run", "e.test.ts", "crashed"),
			])}`;
			const ctx = { db: drizzle(client) } as unknown as TwdContext;

			await recordNewFailures({ ctx, runId: "branch_run" });

			// `b` already failed in `baseline`; `a` and `e` are new. later_baseline finished after the run.
			expect((await flags(client)).branch_run).toEqual([false, 2]);
		});
	},
);
