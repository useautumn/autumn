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
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("test_results_file_branch_idx").on(t.file, t.branch, t.createdAt),
		index("test_results_run_idx").on(t.runId),
	],
);

/** Materialised per-file baseline from recent dev baseline runs. */
export const fileBaselines = pgTable("file_baselines", {
	file: text("file").primaryKey(),
	p50Ms: integer("p50_ms").notNull(),
	p90Ms: integer("p90_ms").notNull(),
	passRate: real("pass_rate").notNull(),
	samples: integer("samples").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
