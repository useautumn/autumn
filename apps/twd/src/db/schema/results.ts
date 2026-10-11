import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	real,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export type FileResultStatus =
	| "passed"
	| "failed"
	| "crashed"
	| "timed_out"
	| "skipped";

/** swarm = a twd run; ci = uploaded by CI (POST /results/ingest), never priced or profiled. */
export type ResultSource = "swarm" | "ci";

/** Append-only: one row per file per run attempt. */
export const testResults = pgTable(
	"test_results",
	{
		id: text("id").primaryKey(),
		runId: text("run_id").notNull(),
		branch: text("branch").notNull(),
		sha: text("sha").notNull(),
		file: text("file").notNull(),
		status: text("status").$type<FileResultStatus>().notNull(),
		durationMs: integer("duration_ms").notNull(),
		attempt: integer("attempt").notNull().default(1),
		/** 1-based repetition of a repeat run; null for normal runs. */
		repetition: integer("repetition"),
		passedTests: integer("passed_tests").notNull().default(0),
		failedTests: integer("failed_tests").notNull().default(0),
		worker: text("worker"),
		failureSummary: text("failure_summary"),
		source: text("source").$type<ResultSource>().notNull().default("swarm"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("test_results_file_branch_idx").on(t.file, t.branch, t.createdAt),
		index("test_results_run_idx").on(t.runId),
		index("test_results_ci_idx")
			.on(t.branch, t.createdAt)
			.where(sql`${t.source} = 'ci'`),
	],
);

/** Materialised per-file baseline from recent dev baseline runs. */
export const fileBaselines = pgTable("file_baselines", {
	file: text("file").primaryKey(),
	p50Ms: integer("p50_ms").notNull(),
	p90Ms: integer("p90_ms").notNull(),
	passRate: real("pass_rate").notNull(),
	samples: integer("samples").notNull(),
	/** ci rows come from dev CI uploads for files no swarm baseline covers; their timings are not sandbox timings. */
	source: text("source").$type<ResultSource>().notNull().default("swarm"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
