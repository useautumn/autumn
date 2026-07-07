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
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { customerEntitlements } from "../cusProductModels/cusEntModels/cusEntTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { features } from "../featureModels/featureTable.js";
import { entitlements } from "../productModels/entModels/entTable.js";
import { prices } from "../productModels/priceModels/priceTable.js";
import { products } from "../productModels/productTable.js";

// A license definition always belongs to a plan; parent_customer_product_id
// narrows it to one customer's attach (their customized override of the
// catalog link).
export const planLicenses = pgTable(
	"plan_license",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		parent_internal_product_id: text("parent_internal_product_id").notNull(),
		parent_customer_product_id: text("parent_customer_product_id"),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		included: integer("included").notNull().default(0),
		prepaid_only: boolean("prepaid_only").notNull().default(true),
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
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "plan_license_parent_customer_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "plan_license_license_product_fkey",
		}).onDelete("cascade"),
		unique("unique_plan_license")
			.on(
				table.parent_internal_product_id,
				table.parent_customer_product_id,
				table.license_internal_product_id,
			)
			.nullsNotDistinct(),
		index("idx_plan_license_parent_product")
			.on(table.parent_internal_product_id)
			.concurrently(),
		index("idx_plan_license_parent_customer_product")
			.on(table.parent_customer_product_id)
			.concurrently(),
		index("idx_plan_license_license")
			.on(table.license_internal_product_id)
			.concurrently(),
		index("idx_plan_license_org_env")
			.on(table.org_id, table.env)
			.concurrently(),
	],
);

// Assignment balance per (parent customer product, license): granted =
// included assignments from the resolved link, remaining = granted - assigned.
export const customerLicenses = pgTable(
	"customer_licenses",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
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
			.on(table.org_id, table.env, table.internal_customer_id)
			.concurrently(),
	],
);

export const licensePoolGrants = pgTable(
	"license_pool_grant",
	{
		id: text().primaryKey().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		parent_customer_product_id: text("parent_customer_product_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		internal_feature_id: text("internal_feature_id").notNull(),
		customer_entitlement_id: text("customer_entitlement_id"),
		period_granted_allowance: numeric("period_granted_allowance", {
			mode: "number",
		})
			.notNull()
			.default(0),
		period_key: numeric("period_key", { mode: "number" }),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "license_pool_grant_customer_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "license_pool_grant_license_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "license_pool_grant_feature_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "license_pool_grant_parent_customer_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "license_pool_grant_customer_entitlement_fkey",
		}).onDelete("set null"),
		uniqueIndex("unique_license_pool_grant")
			.on(
				table.internal_customer_id,
				table.parent_customer_product_id,
				table.license_internal_product_id,
				table.internal_feature_id,
			)
			.concurrently(),
		index("idx_license_pool_grant_customer")
			.on(table.internal_customer_id)
			.concurrently(),
		index("idx_license_pool_grant_license_product")
			.on(table.license_internal_product_id)
			.concurrently(),
		index("idx_license_pool_grant_customer_entitlement")
			.on(table.customer_entitlement_id)
			.concurrently(),
	],
);

export const licenseEntitlements = pgTable(
	"license_entitlements",
	{
		id: text("id").primaryKey(),
		plan_license_id: text("plan_license_id").notNull(),
		entitlement_id: text("entitlement_id").notNull(),
		created_at: numeric("created_at", { mode: "number" }).notNull(),
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
		id: text("id").primaryKey(),
		plan_license_id: text("plan_license_id").notNull(),
		price_id: text("price_id").notNull(),
		created_at: numeric("created_at", { mode: "number" }).notNull(),
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
export type DbCustomerLicense = typeof customerLicenses.$inferSelect;
export type InsertCustomerLicense = typeof customerLicenses.$inferInsert;
export type DbLicensePoolGrant = typeof licensePoolGrants.$inferSelect;
export type InsertLicensePoolGrant = typeof licensePoolGrants.$inferInsert;
