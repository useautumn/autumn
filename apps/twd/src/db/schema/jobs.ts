import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export type JobKind =
	| "warm"
	| "swarm"
	| "nuke"
	| "reinit_keys"
	| "full_nuke_key"
	| "qa";
export type JobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export const jobs = pgTable(
	"jobs",
	{
		id: text("id").primaryKey(),
		kind: text("kind").$type<JobKind>().notNull(),
		/** e.g. warm:<sha>, swarm:<runId>, nuke:<acct>, reinit_keys. */
		singletonKey: text("singleton_key").notNull(),
		status: text("status").$type<JobStatus>().notNull().default("queued"),
		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		/** Handler-owned resumable progress (checkpoint). */
		state: jsonb("state")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		error: text("error"),
		attempts: integer("attempts").notNull().default(0),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		/** Incremented on every lease grant; writes from a stale holder are rejected. */
		fencingToken: bigint("fencing_token", { mode: "number" })
			.notNull()
			.default(0),
		cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
		createdBy: text("created_by").notNull(),
		via: text("via").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(t) => [
		// At most ONE live job per singleton key; finished jobs don't block a rerun.
		uniqueIndex("jobs_live_singleton_idx")
			.on(t.singletonKey)
			.where(sql`status in ('queued', 'running')`),
		index("jobs_status_idx").on(t.status, t.createdAt),
	],
);
