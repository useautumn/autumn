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
import type { ChatAuthMode } from "./chatEnums.js";

export type ChatProvider =
	| "slack"
	| "slack_admin"
	| `slack_admin:${string}`
	| "discord"
	| "web";

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
		auth_mode: text("auth_mode").$type<ChatAuthMode>(),
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
		// Which harness owns this approval's resume path; null = pre-column rows.
		harness: text("harness"),
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

export const chatOAuthCredentials = pgTable(
	"chat_oauth_credentials",
	{
		id: text().primaryKey().notNull(),
		chat_installation_id: text("chat_installation_id").notNull(),
		org_id: text("org_id").notNull(),
		// The dashboard user this credential is scoped to (web chat). Null on
		// legacy/Slack rows, which are installation-scoped rather than per-user.
		user_id: text("user_id"),
		env: text("env").$type<AppEnv>().notNull(),
		oauth_client_id: text("oauth_client_id").notNull(),
		oauth_consent_id: text("oauth_consent_id"),
		access_token: text("access_token").notNull(),
		refresh_token: text("refresh_token").notNull(),
		access_token_expires_at: numeric("access_token_expires_at", {
			mode: "number",
		}).notNull(),
		// When the refresh token dies; past this, a new mint must come from the
		// user's better-auth cookie. Null on legacy rows (treated as expired).
		refresh_token_expires_at: numeric("refresh_token_expires_at", {
			mode: "number",
		}),
		scopes: jsonb().$type<string[]>().notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.chat_installation_id],
			foreignColumns: [chatInstallations.id],
			name: "chat_oauth_credentials_installation_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "chat_oauth_credentials_org_id_fkey",
		}).onDelete("cascade"),
		unique("chat_oauth_credentials_installation_org_env_user_key").on(
			table.chat_installation_id,
			table.org_id,
			table.env,
			table.user_id,
		),
	],
);

export type ChatInstallation = typeof chatInstallations.$inferSelect;
export type ChatApproval = typeof chatApprovals.$inferSelect;
export type ChatOAuthCredential = typeof chatOAuthCredentials.$inferSelect;
