import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export type QaEnvState = "building" | "ready" | "failed" | "deleted";

/** One per QA env (`<name>.atmn.lol`); the Cloudflare Worker holds the live runtime state. */
export const qaEnvs = pgTable(
	"qa_envs",
	{
		name: text("name").primaryKey(),
		ref: text("ref").notNull(),
		sha: text("sha").notNull(),
		url: text("url").notNull(),
		state: text("state").$type<QaEnvState>().notNull().default("building"),
		/** Capy Neon branch the env's own branch was cut from. */
		parentBranch: text("parent_branch").notNull(),
		neonBranchId: text("neon_branch_id"),
		/** sealSecret(JSON) of the Capy machine's BETTER_AUTH_SECRET / ENCRYPTION_IV / ENCRYPTION_PASSWORD. */
		sealedSecrets: text("sealed_secrets").notNull(),
		/** Bumped by every create/re-ship; the qa job keeps building until appliedVersion catches up. */
		requestVersion: integer("request_version").notNull().default(1),
		appliedVersion: integer("applied_version").notNull().default(0),
		/** Options of the latest request, consumed by the job that applies it. */
		freshDbRequested: boolean("fresh_db_requested").notNull().default(false),
		supersedes: text("supersedes"),
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
