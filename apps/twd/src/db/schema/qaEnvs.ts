import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export type QaEnvState = "building" | "ready" | "failed" | "deleted";

export const qaEnvs = pgTable(
	"qa_envs",
	{
		name: text("name").primaryKey(),
		ref: text("ref").notNull(),
		sha: text("sha").notNull(),
		url: text("url").notNull(),
		state: text("state").$type<QaEnvState>().notNull().default("building"),
		parentBranch: text("parent_branch").notNull(),
		neonBranchId: text("neon_branch_id"),
		sealedSecrets: text("sealed_secrets").notNull(),
		requestVersion: integer("request_version").notNull().default(1),
		appliedVersion: integer("applied_version").notNull().default(0),
		freshDbRequested: boolean("fresh_db_requested").notNull().default(false),
		supersedes: text("supersedes"),
		tinybird: boolean("tinybird").notNull().default(false),
		lastJobId: text("last_job_id"),
		error: text("error"),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [index("qa_envs_expires_idx").on(t.expiresAt)],
);
