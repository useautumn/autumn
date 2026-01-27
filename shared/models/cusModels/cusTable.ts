import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
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
		should_send_email_receipts: boolean("should_send_email_receipts").default(
			false,
		),
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
	],
).enableRLS();

collatePgColumn(customers.internal_id, "C");

// CREATE INDEX idx_customers_org_env_internal_id
// ON customers (org_id, env, internal_id DESC);
