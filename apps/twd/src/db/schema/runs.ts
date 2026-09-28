import {
	index,
	integer,
	jsonb,
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
		selection: jsonb("selection").$type<RunSelection>().notNull(),
		status: text("status").$type<RunStatus>().notNull().default("queued"),
		/** baseline = scheduled/merge run on dev that feeds the baseline. */
		purpose: text("purpose")
			.$type<"adhoc" | "baseline">()
			.notNull()
			.default("adhoc"),
		reservationId: text("reservation_id"),
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
});
