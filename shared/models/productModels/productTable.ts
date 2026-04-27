import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils";
import { organizations } from "../orgModels/orgTable";
import type { ProductConfig } from "./productConfig/productConfig";

type ProductProcessor = {
	type: string;
	id: string;
};

export const products = pgTable(
	"products",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		id: text().notNull(),
		name: text(),
		description: text(),
		org_id: text("org_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		env: text().notNull(),
		is_add_on: boolean("is_add_on").notNull().default(false),
		is_default: boolean("is_default").notNull().default(false),
		group: text().default(""),
		version: numeric({ mode: "number" }).notNull().default(1),
		processor: jsonb().$type<ProductProcessor>().default(sql`null`),
		base_variant_id: text("base_variant_id"),
		archived: boolean("archived").notNull().default(false),
		config: jsonb()
			.$type<ProductConfig>()
			.notNull()
			.default(sql`'{}'::jsonb`),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "products_org_id_fkey",
		}).onDelete("cascade"),
		index("idx_products_org_env_id_version").on(
			table.org_id,
			table.env,
			table.id,
			table.version,
		),
		unique("unique_product").on(
			table.org_id,
			table.id,
			table.env,
			table.version,
		),
	],
);

export type DbProduct = typeof products.$inferSelect;
export type InsertDbProduct = typeof products.$inferInsert;
