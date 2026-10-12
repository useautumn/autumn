import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../db/schema/schema.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { loadEtaPriors } from "../../runs/eta/loadEtaPriors.ts";
import type { IngestResultsBody } from "../types/resultsSchemas.ts";
import { getDevStatus } from "./getDevStatus.ts";
import { ingestResults } from "./ingestResults.ts";
import { refreshBaselines } from "./refreshBaselines.ts";
import { orderFilesLongestFirst } from "./resultsApi.ts";

const testDatabaseUrl = process.env.TWD_TEST_DATABASE_URL;
const MIGRATIONS_DIR = join(import.meta.dir, "../../../db/migrations");
const SHA1 = "1".repeat(40);
const SHA2 = "2".repeat(40);

/** Every migration in order, inside a throwaway schema. */
const migrationSql = () =>
	readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith(".sql"))
		.sort()
		.map((name) =>
			readFileSync(join(MIGRATIONS_DIR, name), "utf8")
				.replaceAll("--> statement-breakpoint", "")
				.replaceAll('"public".', ""),
		)
		.join("\n");

const ciUpload = (
	sha: string,
	ciRunId: string,
	results: Record<string, "passed" | "failed">,
	branch = "dev",
): IngestResultsBody => ({
	source: "ci",
	branch,
	sha,
	ciRunId,
	results: Object.entries(results).map(([file, status]) => ({
		file,
		status,
		durationMs: 120,
		attempt: 1,
		passedTests: status === "passed" ? 3 : 2,
		failedTests: status === "passed" ? 0 : 1,
		failureSummary: null,
	})),
});

test.skipIf(!testDatabaseUrl)(
	"CI uploads feed dev_status and CI baselines without touching swarm scheduling",
	async () => {
		const schemaName = `twd_devstatus_${crypto.randomUUID().replaceAll("-", "")}`;
		const admin = postgres(testDatabaseUrl as string, {
			max: 1,
			onnotice: () => {},
		});
		await admin.unsafe(`create schema ${schemaName}`);
		const client = postgres(testDatabaseUrl as string, {
			max: 4,
			onnotice: () => {},
			connection: { search_path: schemaName },
		});
		try {
			await client.unsafe(migrationSql());
			const ctx = {
				db: drizzle(client, { schema }),
				logger: { info: () => {}, warn: () => {} },
			} as unknown as TwdContext;

			await client`insert into runs ${client({
				id: "run_base",
				branch: "dev",
				sha: SHA1,
				selection: JSON.stringify({ groups: ["all"] }),
				status: "passed",
				is_baseline: true,
				file_count: 1,
				created_by: "u",
				via: "session",
				finished_at: new Date().toISOString(),
			})}`;
			await client`insert into test_results ${client({
				id: "tr_swarm",
				run_id: "run_base",
				branch: "dev",
				sha: SHA1,
				file: "integration/a.test.ts",
				status: "passed",
				duration_ms: 60_000,
			})}`;

			// A grep run only ran some of a file's tests, so it never counts as a whole-file result.
			await client`insert into runs ${client({
				id: "run_grep",
				branch: "dev",
				sha: SHA2,
				selection: JSON.stringify({
					files: ["unit/broken.test.ts"],
					grep: "one case",
				}),
				status: "passed",
				created_by: "u",
				via: "session",
				finished_at: new Date().toISOString(),
			})}`;
			await client`insert into test_results ${client({
				id: "tr_grep",
				run_id: "run_grep",
				branch: "dev",
				sha: SHA2,
				file: "unit/broken.test.ts",
				status: "passed",
				duration_ms: 1_000,
			})}`;

			await ingestResults({
				ctx,
				body: ciUpload(SHA1, "gh-1-1", {
					"tests/unit/ok.test.ts": "passed",
					"tests/unit/broken.test.ts": "failed",
					"tests/unit/flaky.test.ts": "failed",
				}),
			});
			const second = ciUpload(SHA2, "gh-2-1", {
				"tests/unit/ok.test.ts": "passed",
				"tests/unit/broken.test.ts": "failed",
				"tests/unit/flaky.test.ts": "passed",
			});
			await ingestResults({ ctx, body: second });
			// Re-posting the same CI run replaces its rows instead of doubling them.
			const again = await ingestResults({ ctx, body: second });
			expect(again).toEqual({
				runId: "ci_gh-2-1",
				inserted: 3,
				baselinesRefreshed: true,
			});
			const branchOnly = await ingestResults({
				ctx,
				body: ciUpload(
					SHA2,
					"gh-3-1",
					{ "unit/branch.test.ts": "failed" },
					"feat/x",
				),
			});
			expect(branchOnly.baselinesRefreshed).toBe(false);

			const statuses = await getDevStatus({
				ctx,
				files: [
					"server/tests/unit/ok.test.ts",
					"unit/broken.test.ts",
					"unit/flaky.test.ts",
					"unit/branch.test.ts",
					"integration/a.test.ts",
				],
				limit: 10,
			});
			expect(
				statuses.map((s) => [s.file, s.status, s.samples, s.latest?.source]),
			).toEqual([
				["unit/ok.test.ts", "passed", 2, "ci"],
				["unit/broken.test.ts", "failing", 2, "ci"],
				["unit/flaky.test.ts", "flaky", 2, "ci"],
				["unit/branch.test.ts", "no_data", 0, undefined],
				["integration/a.test.ts", "passed", 1, "swarm"],
			]);
			expect(statuses[1]?.latest?.sha).toBe(SHA2);

			await refreshBaselines({ ctx });
			const baselines = await client<
				{ file: string; source: string; samples: number; pass_rate: number }[]
			>`select file, source, samples, pass_rate from file_baselines order by file`;
			expect(
				baselines.map((b) => [b.file, b.source, b.samples, b.pass_rate]),
			).toEqual([
				["integration/a.test.ts", "swarm", 1, 1],
				["unit/broken.test.ts", "ci", 2, 0],
				["unit/flaky.test.ts", "ci", 2, 0.5],
				["unit/ok.test.ts", "ci", 2, 1],
			]);

			// A corrected re-post that drops a file's only result drops its CI baseline too.
			await ingestResults({
				ctx,
				body: ciUpload(SHA1, "gh-1-1", {
					"tests/unit/ok.test.ts": "passed",
					"tests/unit/broken.test.ts": "failed",
				}),
			});
			await ingestResults({
				ctx,
				body: ciUpload(SHA2, "gh-2-1", { "tests/unit/ok.test.ts": "passed" }),
			});
			const remaining = await client<
				{ file: string }[]
			>`select file from file_baselines where source = 'ci' order by file`;
			expect(remaining.map((b) => b.file)).toEqual([
				"unit/broken.test.ts",
				"unit/ok.test.ts",
			]);

			// CI timings never steer swarm scheduling or ETA, and CI rows never become profiles.
			expect(
				await orderFilesLongestFirst({
					ctx,
					files: ["integration/a.test.ts", "unit/ok.test.ts"],
				}),
			).toEqual(["unit/ok.test.ts", "integration/a.test.ts"]);
			const priors = await loadEtaPriors({ ctx });
			expect(priors.model.expect("unit/ok.test.ts")?.p50Ms).toBe(60_000);
			const [{ count }] = await client<
				{ count: number }[]
			>`select count(*)::int as count from file_profiles`;
			expect(count).toBe(0);
		} finally {
			await client.end();
			await admin.unsafe(`drop schema ${schemaName} cascade`);
			await admin.end();
		}
	},
);
