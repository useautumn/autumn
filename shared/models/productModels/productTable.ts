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
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils";
import { billingControlColumns } from "../cusModels/billingControls/billingControlTableColumns";
import { organizations } from "../orgModels/orgTable";
import type { ProductConfig } from "./productConfig/productConfig";
import type { ProductMetadata } from "./productMetadata";

type ProductProcessor = {
	type: string;
	id: string;
	/** Legacy/alias Stripe product ids that also map to this product. */
	additional_ids?: string[];
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
		// User-facing version identity; numeric `version` stays as an internal,
		// monotonic, never-reused sequence. Nullable until dual-write is proven
		// out everywhere, then tightened.
		version_slug: text("version_slug"),
		// The version that represents the plan (default resolution target).
		// At most one per (org_id, id, env) — enforced by unique_active_product.
		active: boolean("active").notNull().default(false),
		processor: jsonb().$type<ProductProcessor>().default(sql`null`),
		base_variant_id: text("base_variant_id"),
		base_internal_product_id: text("base_internal_product_id"),
		archived: boolean("archived").notNull().default(false),
		config: jsonb().$type<ProductConfig>().notNull().default(sql`'{}'::jsonb`),
		metadata: jsonb()
			.$type<ProductMetadata>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...billingControlColumns(),
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
		index("idx_products_org_env_base_internal_product_id")
			.on(table.org_id, table.env, table.base_internal_product_id)
			.where(sql`${table.base_internal_product_id} IS NOT NULL`)
			.concurrently(),
		unique("unique_product").on(
			table.org_id,
			table.id,
			table.env,
			table.version,
		),
		uniqueIndex("unique_product_version_slug")
			.on(table.org_id, table.id, table.env, table.version_slug)
			.where(sql`${table.version_slug} IS NOT NULL`)
			.concurrently(),
		uniqueIndex("unique_active_product")
			.on(table.org_id, table.id, table.env)
			.where(sql`${table.active} = true`)
			.concurrently(),
	],
);

export type DbProduct = typeof products.$inferSelect;
export type InsertDbProduct = typeof products.$inferInsert;
