import {
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import type { AppEnv } from "../genModels/genEnums.js";
import { organizations } from "../orgModels/orgTable.js";

export type ChatProvider = "slack" | "discord";

export const chatInstallations = pgTable(
	"chat_installations",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		provider: text("provider").$type<ChatProvider>().notNull(),
		workspace_id: text("workspace_id").notNull(),
		workspace_name: text("workspace_name").notNull(),
		bot_user_id: text("bot_user_id"),
		bot_access_token: text("bot_access_token").notNull(),
		scopes: jsonb().$type<string[]>().notNull(),
		default_env: text("default_env").$type<AppEnv>().notNull(),
		sandbox_api_key_id: text("sandbox_api_key_id"),
		sandbox_api_key: text("sandbox_api_key"),
		live_api_key_id: text("live_api_key_id"),
		live_api_key: text("live_api_key"),
		installed_by_user_id: text("installed_by_user_id"),
		installed_by_provider_user_id: text("installed_by_provider_user_id"),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "chat_installations_org_id_fkey",
		}).onDelete("cascade"),
		unique("chat_installations_org_provider_key").on(
			table.org_id,
			table.provider,
		),
		unique("chat_installations_provider_workspace_key").on(
			table.provider,
			table.workspace_id,
		),
	],
);

export const chatApprovals = pgTable(
	"chat_approvals",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		provider: text("provider").$type<ChatProvider>().notNull(),
		workspace_id: text("workspace_id").notNull(),
		channel_id: text("channel_id").notNull(),
		message_ts: text("message_ts"),
		provider_user_id: text("provider_user_id").notNull(),
		env: text("env").$type<AppEnv>().notNull(),
		run_id: text("run_id"),
		tool_call_id: text("tool_call_id"),
		tool_name: text("tool_name").notNull(),
		tool_args: jsonb("tool_args").$type<Record<string, unknown>>().notNull(),
		preview: jsonb().$type<unknown>(),
		status: text("status").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		expires_at: numeric("expires_at", { mode: "number" }).notNull(),
		decided_at: numeric("decided_at", { mode: "number" }),
		decided_by_provider_user_id: text("decided_by_provider_user_id"),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "chat_approvals_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type ChatInstallation = typeof chatInstallations.$inferSelect;
export type ChatApproval = typeof chatApprovals.$inferSelect;
