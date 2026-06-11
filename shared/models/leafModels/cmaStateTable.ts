import { numeric, primaryKey, text } from "drizzle-orm/pg-core";
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
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		vault_id: text("vault_id").notNull(),
		credential_id: text("credential_id").notNull(),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [primaryKey({ columns: [table.org_id, table.env] })],
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
