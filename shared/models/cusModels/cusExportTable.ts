import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";
import type {
	CustomerExportField,
	CustomerExportSnapshot,
	CustomerExportStatus,
} from "./cusExportModels.js";

export const customerExports = pgTable(
	"customer_exports",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text().notNull(),
		status: text().$type<CustomerExportStatus>().notNull(),
		fields: jsonb().$type<CustomerExportField[]>().notNull(),
		snapshot: jsonb().$type<CustomerExportSnapshot>().notNull(),
		requested_by_user_id: text("requested_by_user_id"),
		trigger_run_id: text("trigger_run_id"),
		s3_key: text("s3_key"),
		s3_upload_id: text("s3_upload_id"),
		// Legacy column from the partitioned fan-out design; no longer written.
		partition_plan: jsonb("partition_plan"),
		row_count: numeric({ mode: "number" }),
		byte_count: numeric({ mode: "number" }),
		error_message: text("error_message"),
		created_at: numeric({ mode: "number" }).notNull(),
		started_at: numeric({ mode: "number" }),
		completed_at: numeric({ mode: "number" }),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "customer_exports_org_id_fkey",
		}).onDelete("cascade"),
		index("idx_customer_exports_org_env_created_at")
			.on(table.org_id, table.env, sql`${table.created_at} DESC`)
			.concurrently(),
		// One queued/running export per org+env; the create endpoint maps the
		// violation to a 409 carrying the active export id.
		uniqueIndex("customer_exports_active_per_org_env_unique")
			.on(table.org_id, table.env)
			.where(sql`${table.status} IN ('queued', 'running')`)
			.concurrently(),
	],
);

export type DbCustomerExport = typeof customerExports.$inferSelect;
export type InsertDbCustomerExport = typeof customerExports.$inferInsert;
