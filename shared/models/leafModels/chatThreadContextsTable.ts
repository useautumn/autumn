import { numeric, text, unique } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

export type ChatThreadContextSource = "installation" | "admin_selection";

export const chatThreadContexts = leafSchema.table(
	"chat_thread_contexts",
	{
		id: text().primaryKey().notNull(),
		chat_installation_id: text("chat_installation_id").notNull(),
		workspace_id: text("workspace_id").notNull(),
		channel_id: text("channel_id").notNull(),
		thread_id: text("thread_id").notNull(),
		org_id: text("org_id").notNull(),
		org_slug: text("org_slug"),
		source: text("source").$type<ChatThreadContextSource>().notNull(),
		target_identifier: text("target_identifier"),
		created_by_provider_user_id: text("created_by_provider_user_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		unique("chat_thread_contexts_thread_key").on(
			table.workspace_id,
			table.channel_id,
			table.thread_id,
		),
	],
);

export type ChatThreadContext = typeof chatThreadContexts.$inferSelect;
