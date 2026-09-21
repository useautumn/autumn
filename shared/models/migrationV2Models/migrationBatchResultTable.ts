import {
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { organizations } from "../orgModels/orgTable.js";

export const migrationBatchResults = pgTable(
	"migration_batch_results",
	{
		org_id: text()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		env: text().notNull(),
		batch_id: text().notNull(),
		version: integer().notNull(),
		input: jsonb().$type<Record<string, unknown>>().notNull(),
		// Null exists only inside the transaction that is still executing the batch.
		result: jsonb().$type<Record<string, unknown>>(),
		created_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.org_id, table.env, table.batch_id] }),
	],
);
