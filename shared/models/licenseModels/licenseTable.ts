import { sql } from "drizzle-orm";
import {
	boolean,
	check,
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
import { entities } from "../cusModels/entityModels/entityTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { products } from "../productModels/productTable.js";
import type { LicenseCustomize } from "./licenseModels.js";

export const planLicenses = pgTable(
	"plan_license",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		parent_internal_product_id: text("parent_internal_product_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		included_quantity: integer("included_quantity").notNull().default(0),
		allow_extra_quantity: boolean("allow_extra_quantity")
			.notNull()
			.default(false),
		customize: jsonb().$type<LicenseCustomize | null>(),
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
		unique("unique_plan_license").on(
			table.parent_internal_product_id,
			table.license_internal_product_id,
		),
		index("idx_plan_license_parent")
			.on(table.parent_internal_product_id)
			.concurrently(),
		index("idx_plan_license_license")
			.on(table.license_internal_product_id)
			.concurrently(),
		index("idx_plan_license_org_env")
			.on(table.org_id, table.env)
			.concurrently(),
	],
);

export const customerProductLicenses = pgTable(
	"customer_product_license",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		parent_customer_product_id: text("parent_customer_product_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		included_quantity: integer("included_quantity").notNull().default(0),
		allow_extra_quantity: boolean("allow_extra_quantity")
			.notNull()
			.default(false),
		customize: jsonb().$type<LicenseCustomize | null>(),
		metadata: jsonb().$type<Record<string, unknown>>().default({}),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "customer_product_license_parent_cp_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "customer_product_license_license_product_fkey",
		}).onDelete("cascade"),
		unique("unique_customer_product_license").on(
			table.parent_customer_product_id,
			table.license_internal_product_id,
		),
		index("idx_customer_product_license_license")
			.on(table.license_internal_product_id)
			.concurrently(),
		index("idx_customer_product_license_org_env")
			.on(table.org_id, table.env)
			.concurrently(),
	],
);

export const licensePools = pgTable(
	"license_pools",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		parent_customer_product_id: text("parent_customer_product_id").notNull(),
		plan_license_id: text("plan_license_id"),
		customer_product_license_id: text("customer_product_license_id"),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		license_customer_product_id: text("license_customer_product_id"),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "license_pools_customer_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "license_pools_parent_customer_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.plan_license_id],
			foreignColumns: [planLicenses.id],
			name: "license_pools_plan_license_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customer_product_license_id],
			foreignColumns: [customerProductLicenses.id],
			name: "license_pools_customer_product_license_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "license_pools_license_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "license_pools_license_customer_product_fkey",
		}).onDelete("set null"),
		unique("unique_license_pool").on(
			table.parent_customer_product_id,
			table.plan_license_id,
		),
		unique("unique_custom_license_pool").on(
			table.parent_customer_product_id,
			table.customer_product_license_id,
		),
		check(
			"license_pools_source_check",
			sql`(${table.plan_license_id} IS NULL) <> (${table.customer_product_license_id} IS NULL)`,
		),
		index("idx_license_pools_customer")
			.on(table.internal_customer_id)
			.concurrently(),
		index("idx_license_pools_parent_cp")
			.on(table.parent_customer_product_id)
			.concurrently(),
		index("idx_license_pools_license_product")
			.on(table.license_internal_product_id)
			.concurrently(),
		index("idx_license_pools_customer_product_license")
			.on(table.customer_product_license_id)
			.concurrently(),
		index("idx_license_pools_customer_license")
			.on(table.internal_customer_id, table.license_internal_product_id)
			.concurrently(),
		index("idx_license_pools_org_env_customer")
			.on(table.org_id, table.env, table.internal_customer_id)
			.concurrently(),
	],
);

export const licenseAssignments = pgTable(
	"license_assignments",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		license_pool_id: text("license_pool_id").notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		internal_entity_id: text("internal_entity_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		provisioned_customer_product_id: text("provisioned_customer_product_id"),
		started_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		ended_at: numeric({ mode: "number" }),
		metadata: jsonb().$type<Record<string, unknown>>().default({}),
	},
	(table) => [
		foreignKey({
			columns: [table.license_pool_id],
			foreignColumns: [licensePools.id],
			name: "license_assignments_pool_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "license_assignments_customer_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "license_assignments_entity_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.license_internal_product_id],
			foreignColumns: [products.internal_id],
			name: "license_assignments_license_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.provisioned_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "license_assignments_provisioned_customer_product_fkey",
		}).onDelete("set null"),
		index("idx_license_assignments_pool")
			.on(table.license_pool_id)
			.concurrently(),
		index("idx_license_assignments_customer")
			.on(table.internal_customer_id)
			.concurrently(),
		index("idx_license_assignments_entity")
			.on(table.internal_entity_id)
			.concurrently(),
		index("idx_license_assignments_customer_license")
			.on(table.internal_customer_id, table.license_internal_product_id)
			.concurrently(),
		index("idx_license_assignments_active_pool")
			.on(table.license_pool_id)
			.where(sql`${table.ended_at} IS NULL`)
			.concurrently(),
		uniqueIndex("unique_active_license_assignment_pool_entity")
			.on(table.license_pool_id, table.internal_entity_id)
			.where(sql`${table.ended_at} IS NULL`)
			.concurrently(),
		uniqueIndex("unique_active_license_assignment_customer_entity_license")
			.on(
				table.org_id,
				table.env,
				table.internal_customer_id,
				table.internal_entity_id,
				table.license_internal_product_id,
			)
			.where(sql`${table.ended_at} IS NULL`)
			.concurrently(),
	],
);

export type DbPlanLicense = typeof planLicenses.$inferSelect;
export type InsertPlanLicense = typeof planLicenses.$inferInsert;
export type DbCustomerProductLicense =
	typeof customerProductLicenses.$inferSelect;
export type InsertCustomerProductLicense =
	typeof customerProductLicenses.$inferInsert;
export type DbLicensePool = typeof licensePools.$inferSelect;
export type InsertLicensePool = typeof licensePools.$inferInsert;
export type DbLicenseAssignment = typeof licenseAssignments.$inferSelect;
export type InsertLicenseAssignment = typeof licenseAssignments.$inferInsert;
