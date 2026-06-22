import { jsonb, numeric, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

// Claude Managed Agents runtime state, in the `leaf` schema to keep public tidy.
// Scoped by (org_id, env) so one tenant's CMA state never collides with another's.
// (The shared agent is a single global resource — cached in-memory, not here.)

export const cmaSessions = leafSchema.table(
	"cma_sessions",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		thread_key: text("thread_key").notNull(),
		session_id: text("session_id").notNull(),
		// Braintrust root span (span.export()) for the thread — later turns continue
		// this trace via `parent`, so a Slack thread renders as one Braintrust thread.
		braintrust_parent: text("braintrust_parent"),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({ columns: [table.org_id, table.env, table.thread_key] }),
	],
);

export const cmaVaults = leafSchema.table(
	"cma_vaults",
	{
		chat_installation_id: text("chat_installation_id").notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		vault_id: text("vault_id").notNull(),
		credential_id: text("credential_id").notNull(),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({
			columns: [table.chat_installation_id, table.org_id, table.env],
		}),
	],
);

// AI SDK harness runtime state, scoped per thread. Holds the HarnessAgent
// session id + opaque resume payload so follow-up turns reattach the same
// session across processes; the sandbox provider derives the sandbox from it.
export const harnessSessions = leafSchema.table(
	"harness_sessions",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		thread_key: text("thread_key").notNull(),
		session_id: text("session_id").notNull(),
		// HarnessAgentResumeSessionState from session.stop()/detach(), replayed on resume.
		resume_state: jsonb("resume_state"),
		braintrust_parent: text("braintrust_parent"),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({ columns: [table.org_id, table.env, table.thread_key] }),
	],
);

// Per-(org, env) CMA memory store id → cross-thread memory. Content lives in CMA.
export const cmaMemory = leafSchema.table(
	"cma_memory",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		memory_store_id: text("memory_store_id").notNull(),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [primaryKey({ columns: [table.org_id, table.env] })],
);

export const slackAdminThreads = leafSchema.table(
	"slack_admin_threads",
	{
		id: text().primaryKey().notNull(),
		chat_installation_id: text("chat_installation_id").notNull(),
		workspace_id: text("workspace_id").notNull(),
		channel_id: text("channel_id").notNull(),
		thread_id: text("thread_id").notNull(),
		org_id: text("org_id").notNull(),
		org_slug: text("org_slug"),
		target_identifier: text("target_identifier").notNull(),
		created_by_provider_user_id: text("created_by_provider_user_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		unique("slack_admin_threads_thread_key").on(
			table.workspace_id,
			table.channel_id,
			table.thread_id,
		),
	],
);
