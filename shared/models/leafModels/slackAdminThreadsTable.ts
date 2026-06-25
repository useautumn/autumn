import { numeric, text, unique } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

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
