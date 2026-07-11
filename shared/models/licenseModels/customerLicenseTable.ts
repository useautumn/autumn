import {
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { products } from "../productModels/productTable.js";

/** Assignment balance for one parent customer product and license. */
export const customerLicenses = pgTable(
	"customer_licenses",
	{
		id: text().primaryKey().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		parent_customer_product_id: text("parent_customer_product_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		granted: numeric("granted", { mode: "number" }).notNull().default(0),
		remaining: numeric("remaining", { mode: "number" }).notNull().default(0),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "customer_licenses_customer_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "customer_licenses_parent_customer_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "customer_licenses_license_product_fkey",
		}).onDelete("cascade"),
		uniqueIndex("unique_customer_license")
			.on(table.parent_customer_product_id, table.license_internal_product_id)
			.concurrently(),
		index("idx_customer_licenses_customer")
			.on(table.internal_customer_id)
			.concurrently(),
	],
);

export type DbCustomerLicense = typeof customerLicenses.$inferSelect;
export type InsertCustomerLicense = typeof customerLicenses.$inferInsert;
