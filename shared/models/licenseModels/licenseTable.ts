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
import { entities } from "../cusModels/entityModels/entityTable.js";
import { customerEntitlements } from "../cusProductModels/cusEntModels/cusEntTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { features } from "../featureModels/featureTable.js";
import { entitlements } from "../productModels/entModels/entTable.js";
import { products } from "../productModels/productTable.js";
import type { LicenseCustomize } from "./licenseModels.js";

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
		pooled_feature_ids: jsonb("pooled_feature_ids")
			.$type<string[]>()
			.notNull()
			.default([]),
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

export const licenseAssignments = pgTable(
	"license_assignments",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		parent_customer_product_id: text("parent_customer_product_id").notNull(),
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
			columns: [table.parent_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "license_assignments_parent_customer_product_fkey",
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
		index("idx_license_assignments_parent")
			.on(table.parent_customer_product_id)
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
		index("idx_license_assignments_active_parent")
			.on(table.parent_customer_product_id, table.license_internal_product_id)
			.where(sql`${table.ended_at} IS NULL`)
			.concurrently(),
		uniqueIndex("unique_active_license_assignment_parent_entity")
			.on(
				table.parent_customer_product_id,
				table.internal_entity_id,
				table.license_internal_product_id,
			)
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

export const licensePoolGrants = pgTable(
	"license_pool_grant",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		license_internal_product_id: text("license_internal_product_id").notNull(),
		internal_feature_id: text("internal_feature_id").notNull(),
		entitlement_id: text("entitlement_id").notNull(),
		customer_entitlement_id: text("customer_entitlement_id").notNull(),
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
			columns: [table.entitlement_id],
			foreignColumns: [entitlements.id],
			name: "license_pool_grant_entitlement_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "license_pool_grant_customer_entitlement_fkey",
		}).onDelete("cascade"),
		uniqueIndex("unique_license_pool_grant")
			.on(
				table.org_id,
				table.env,
				table.internal_customer_id,
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
	],
);

export type DbPlanLicense = typeof planLicenses.$inferSelect;
export type InsertPlanLicense = typeof planLicenses.$inferInsert;
export type DbLicenseAssignment = typeof licenseAssignments.$inferSelect;
export type InsertLicenseAssignment = typeof licenseAssignments.$inferInsert;
export type DbLicensePoolGrant = typeof licensePoolGrants.$inferSelect;
export type InsertLicensePoolGrant = typeof licensePoolGrants.$inferInsert;
