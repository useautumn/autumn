import { numeric, text, unique } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

export const cmaVaults = leafSchema.table(
	"cma_vaults",
	{
		id: text("id").primaryKey().notNull(),
		chat_installation_id: text("chat_installation_id").notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		user_id: text("user_id"),
		vault_id: text("vault_id").notNull(),
		credential_id: text("credential_id").notNull(),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		unique("cma_vaults_installation_org_env_user_key")
			.on(table.chat_installation_id, table.org_id, table.env, table.user_id)
			.nullsNotDistinct(),
	],
);
