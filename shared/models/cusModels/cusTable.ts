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
import { collatePgColumn } from "../../db/utils.js";
import type { ExternalProcessors } from "../genModels/processorSchemas.js";
import { organizations } from "../orgModels/orgTable.js";
import type {
	AutoTopup,
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageAlert,
} from "./billingControls/customerBillingControls.js";

export type CustomerProcessor = {
	type: "stripe";
	id: string;
};

export const customers = pgTable(
	"customers",
	{
		internal_id: text("internal_id").primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
		name: text(),
		id: text(),
		email: text(),
		fingerprint: text().default(sql`null`),
		metadata: jsonb().$type<Record<string, unknown>>(),
		env: text().notNull(),
		processor: jsonb().$type<CustomerProcessor>(),
		processors: jsonb()
			.$type<ExternalProcessors>()
			.default({} as ExternalProcessors),
		send_email_receipts: boolean("send_email_receipts").default(false),
		auto_topups: jsonb().$type<AutoTopup[]>(),
		spend_limits: jsonb().$type<DbSpendLimit[]>(),
		usage_alerts: jsonb().$type<DbUsageAlert[]>(),
		overage_allowed: jsonb().$type<DbOverageAllowed[]>(),
	},
	(table) => [
		unique("cus_id_constraint").on(table.org_id, table.id, table.env),
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "customers_org_id_fkey",
		}).onDelete("cascade"),
		// Ensure only ONE customer per (org, env, email) can have id = NULL
		uniqueIndex("customers_email_null_id_unique")
			.on(table.org_id, table.env, sql`lower(${table.email})`)
			.where(
				sql`${table.id} IS NULL AND ${table.email} IS NOT NULL AND ${table.email} != ''`,
			),
		index("idx_customers_org_env_fingerprint")
			.on(table.org_id, table.env, table.fingerprint)
			.where(sql`${table.fingerprint} IS NOT NULL`),
		index("idx_customers_processor_id").on(sql`(${table.processor} ->> 'id')`),
		index("idx_customers_composite").on(table.org_id, table.env, table.id),
		index("idx_customers_org_env_internal_id").on(
			table.org_id,
			table.env,
			sql`${table.internal_id} DESC`,
		),
		index("idx_customers_email_trgm")
			.using("gin", sql`${table.email} gin_trgm_ops`)
			.where(sql`${table.email} IS NOT NULL`),
		index("idx_customers_name_trgm")
			.using("gin", sql`${table.name} gin_trgm_ops`)
			.where(sql`${table.name} IS NOT NULL`),
		index("idx_customers_id_trgm")
			.using("gin", sql`${table.id} gin_trgm_ops`)
			.where(sql`${table.id} IS NOT NULL`),
		index("idx_customers_org_id_env_created_at").on(
			table.org_id,
			table.env,
			sql`${table.created_at} DESC`,
		),
	],
).enableRLS();

collatePgColumn(customers.internal_id, "C");
