import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { entitlements } from "../productModels/entModels/entTable.js";
import { prices } from "../productModels/priceModels/priceTable.js";
import { products } from "../productModels/productTable.js";

/** A catalog definition or customer-specific override linking a parent plan to a license. */
export const planLicenses = pgTable(
	"plan_license",
	{
		id: text().primaryKey().notNull(),
		parent_internal_product_id: text("parent_internal_product_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		// WHO owns the row: false = catalog link shared by every customer of the
		// parent plan; true = one customer's definition, reachable only via its
		// pool's customer_licenses.plan_license_id.
		is_custom: boolean("is_custom").notNull().default(false),
		included: integer("included").notNull().default(0),
		prepaid_only: boolean("prepaid_only").notNull().default(true),
		// WHAT the items are: true = license_entitlements/license_prices carry
		// this row's item set; false = items come from the license product's base
		// rows. An is_custom row with only included/price-free field changes stays
		// customized=false.
		customized: boolean("customized").notNull().default(false),
		metadata: jsonb().$type<Record<string, unknown>>().default({}),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.parent_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "plan_license_parent_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "plan_license_license_product_fkey",
		}).onDelete("cascade"),
		// Custom rows are unconstrained: many customers may customize the
		// same (parent, license) pair.
		uniqueIndex("unique_plan_license")
			.on(table.parent_internal_product_id, table.license_internal_product_id)
			.where(sql`${table.is_custom} = false`)
			.concurrently(),
		index("idx_plan_license_parent_product")
			.on(table.parent_internal_product_id)
			.concurrently(),
		index("idx_plan_license_license")
			.on(table.license_internal_product_id)
			.concurrently(),
	],
);

export const licenseEntitlements = pgTable(
	"license_entitlements",
	{
		id: text().primaryKey().notNull(),
		plan_license_id: text("plan_license_id").notNull(),
		entitlement_id: text("entitlement_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.plan_license_id],
			foreignColumns: [planLicenses.id],
			name: "license_entitlements_plan_license_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.entitlement_id],
			foreignColumns: [entitlements.id],
			name: "license_entitlements_entitlement_fkey",
		}).onDelete("restrict"),
		uniqueIndex("unique_license_entitlement")
			.on(table.plan_license_id, table.entitlement_id)
			.concurrently(),
		index("idx_license_entitlements_entitlement")
			.on(table.entitlement_id)
			.concurrently(),
	],
);

export const licensePrices = pgTable(
	"license_prices",
	{
		id: text().primaryKey().notNull(),
		plan_license_id: text("plan_license_id").notNull(),
		price_id: text("price_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.plan_license_id],
			foreignColumns: [planLicenses.id],
			name: "license_prices_plan_license_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.price_id],
			foreignColumns: [prices.id],
			name: "license_prices_price_fkey",
		}).onDelete("restrict"),
		uniqueIndex("unique_license_price")
			.on(table.plan_license_id, table.price_id)
			.concurrently(),
		index("idx_license_prices_price").on(table.price_id).concurrently(),
	],
);

export type DbLicenseEntitlement = typeof licenseEntitlements.$inferSelect;
export type DbLicensePrice = typeof licensePrices.$inferSelect;
export type DbPlanLicense = typeof planLicenses.$inferSelect;
export type InsertPlanLicense = typeof planLicenses.$inferInsert;
