import { numeric, primaryKey, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

export const cmaSessions = leafSchema.table(
	"cma_sessions",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		thread_key: text("thread_key").notNull(),
		session_id: text("session_id").notNull(),
		braintrust_parent: text("braintrust_parent"),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({ columns: [table.org_id, table.env, table.thread_key] }),
	],
);
