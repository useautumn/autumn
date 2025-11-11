import { organizations } from "@models/orgModels/orgTable.js";
import { foreignKey, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const vercelResources = pgTable(
	"vercel_resources",
	{
		id: text("id").primaryKey().notNull(), // vre_[...]
		org_id: text("org_id").notNull(), // org_[...]
		env: text("env").notNull(), // live, sandbox
		installation_id: text("installation_id").notNull(), // icfg_[...]
		name: text("name").notNull(),
		status: text("status").notNull(),
		metadata: jsonb("metadata").notNull().default({}),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "vercel_resources_org_id_fkey",
		}).onDelete("cascade"),
	],
);
