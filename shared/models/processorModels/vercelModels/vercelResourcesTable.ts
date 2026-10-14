import { organizations } from "@models/orgModels/orgTable.js";
import { sql } from "drizzle-orm";
import {
	foreignKey,
	jsonb,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const vercelResources = pgTable(
	"vercel_resources",
	{
		id: text("id").primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		installation_id: text("installation_id").notNull(),
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
		uniqueIndex("vercel_resources_installation_name_unique_idx")
			.on(table.org_id, table.env, table.installation_id, table.name)
			.where(sql`status <> 'uninstalled'`),
	],
);

export type VercelResource = typeof vercelResources.$inferSelect;
