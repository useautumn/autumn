import {
	boolean,
	index,
	integer,
	jsonb,
	real,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export type RunStatus =
	| "queued"
	| "warming"
	| "provisioning"
	| "running"
	| "tearing_down"
	| "passed"
	| "failed"
	| "cancelled"
	| "errored";

export type RunSelection = {
	groups?: string[];
	files?: string[];
	/** Test-name filter forwarded to bun test --test-name-pattern. */
	grep?: string;
};

export const runs = pgTable(
	"runs",
	{
		id: text("id").primaryKey(),
		branch: text("branch").notNull(),
		sha: text("sha").notNull(),
		pinnedSha: boolean("pinned_sha").notNull().default(false),
		selection: jsonb("selection").$type<RunSelection>().notNull(),
		status: text("status").$type<RunStatus>().notNull().default("queued"),
		/** baseline = scheduled/merge run on dev that feeds the baseline. */
		purpose: text("purpose")
			.$type<"adhoc" | "baseline">()
			.notNull()
			.default("adhoc"),
		workersWanted: integer("workers_wanted"),
		costUsd: real("cost_usd").notNull().default(0),
		workerSeconds: real("worker_seconds").notNull().default(0),
		jobId: text("job_id"),
		fileCount: integer("file_count"),
		workerCount: integer("worker_count"),
		passed: integer("passed").notNull().default(0),
		failed: integer("failed").notNull().default(0),
		/** Live progress snapshot from the swarm child (phase, worker grid, counts). */
		progress: jsonb("progress")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdBy: text("created_by").notNull(),
		via: text("via").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(t) => [
		index("runs_status_idx").on(t.status, t.createdAt),
		index("runs_branch_idx").on(t.branch, t.createdAt),
	],
);

export const warmImages = pgTable("warm_images", {
	sha: text("sha").primaryKey(),
	branch: text("branch").notNull(),
	status: text("status").$type<"building" | "ready" | "failed">().notNull(),
	jobId: text("job_id"),
	imageTag: text("image_tag"),
	error: text("error"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	readyAt: timestamp("ready_at", { withTimezone: true }),
	/** Modal cost of building this warm image (warm sandbox lifetime). */
	buildSeconds: real("build_seconds"),
	costUsd: real("cost_usd"),
	createdBy: text("created_by"),
});

/** One row per worker sandbox; cost = (ended_at ?? now) - started_at priced at its cores/memory. */
export const runWorkers = pgTable(
	"run_workers",
	{
		id: text("id").primaryKey(),
		runId: text("run_id").notNull(),
		name: text("name").notNull(),
		sandboxId: text("sandbox_id"),
		accountId: text("account_id"),
		cores: real("cores").notNull(),
		memoryGib: real("memory_gib").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
	},
	(t) => [index("run_workers_run_idx").on(t.runId), index("run_workers_started_idx").on(t.startedAt)],
);
