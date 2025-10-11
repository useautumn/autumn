import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { collatePgColumn, sqlNow } from "../../db/utils.js";
import { organizations } from "../orgModels/orgTable.js";

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
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "products_org_id_fkey",
		}).onDelete("cascade"),
		unique("unique_product").on(
			table.org_id,
			table.id,
			table.env,
			table.version,
		),
	],
);

collatePgColumn(products.internal_id, "C");
