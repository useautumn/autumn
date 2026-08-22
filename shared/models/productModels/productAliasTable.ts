import {
	foreignKey,
	numeric,
	pgTable,
	primaryKey,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils";
import { organizations } from "../orgModels/orgTable";

export const productAliases = pgTable(
	"product_aliases",
	{
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		alias_id: text("alias_id").notNull(),
		canonical_plan_id: text("canonical_plan_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		primaryKey({
			columns: [table.org_id, table.env, table.alias_id],
			name: "product_aliases_pkey",
		}),
		unique("product_aliases_canonical_unique").on(
			table.org_id,
			table.env,
			table.canonical_plan_id,
		),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "product_aliases_org_id_fkey",
		}).onDelete("cascade"),
	],
);

export type DbProductAlias = typeof productAliases.$inferSelect;
export type InsertDbProductAlias = typeof productAliases.$inferInsert;
