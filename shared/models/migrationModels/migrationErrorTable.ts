import {
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { customers } from "../cusModels/cusTable.js";
import { migrationJobs } from "./migrationJobTable.js";

export const migrationErrors = pgTable(
	"migration_errors",
	{
		internal_customer_id: text().notNull(),
		migration_job_id: text().notNull(),
		created_at: numeric({ mode: "number" }),
		updated_at: numeric({ mode: "number" }),
		data: jsonb(),
		message: text(),
		code: text(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "migration_customers_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.migration_job_id],
			foreignColumns: [migrationJobs.id],
			name: "migration_customers_migration_job_id_fkey",
		}).onDelete("cascade"),

		primaryKey({
			columns: [table.internal_customer_id, table.migration_job_id],
			name: "migration_errors_pkey",
		}),
	],
);
