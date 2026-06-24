import { jsonb, numeric, primaryKey, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

export const harnessSessions = leafSchema.table(
	"harness_sessions",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		thread_key: text("thread_key").notNull(),
		session_id: text("session_id").notNull(),
		resume_state: jsonb("resume_state"),
		braintrust_parent: text("braintrust_parent"),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({ columns: [table.org_id, table.env, table.thread_key] }),
	],
);
