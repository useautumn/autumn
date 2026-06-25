import { numeric, primaryKey, text } from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { leafSchema } from "./leafSchema.js";

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
