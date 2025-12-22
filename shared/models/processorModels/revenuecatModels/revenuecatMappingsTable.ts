import type { AppEnv } from "@models/genModels/genEnums";
import { organizations } from "@models/orgModels/orgTable.js";
import { foreignKey, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const revenuecatMappings = pgTable(
	"revenuecat_mappings",
	{
		org_id: text("org_id").notNull(),
		env: text("env").$type<AppEnv>().notNull(),
		autumn_product_id: text("autumn_product_id").notNull(),
		revenuecat_product_ids: text("revenuecat_product_ids")
			.array()
			.notNull()
			.default([]),
	},
	(table) => [
		primaryKey({
			columns: [table.org_id, table.env, table.autumn_product_id],
			name: "revenuecat_mappings_pkey",
		}),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "revenuecat_mappings_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type RevenuecatMapping = typeof revenuecatMappings.$inferSelect;
