import {
	boolean,
	foreignKey,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MigrationFilter } from "../../api/migrations/filters/migrationFilter.js";
import type { Operations } from "../../api/migrations/operations/operations.js";
import { organizations } from "../orgModels/orgTable.js";

type LoosePreparedState = Record<string, unknown>;

export const migrations = pgTable(
	"migrations",
	{
		internal_id: text().primaryKey().notNull(),
		id: text().notNull(),
		org_id: text().notNull(),
		env: text().notNull(),

		filter: jsonb().$type<MigrationFilter>(),
		operations: jsonb().$type<Operations>(),
		prepared_state: jsonb().$type<LoosePreparedState>(),

		no_billing_changes: boolean(),
		retry_failed: boolean().notNull().default(false),
		archived: boolean().notNull().default(false),

		created_at: numeric({ mode: "number" }).notNull(),
		updated_at: numeric({ mode: "number" }),
	},
	(table) => [
		foreignKey({
			columns: [table.org_id],
			foreignColumns: [organizations.id],
			name: "migrations_org_id_fkey",
		}).onDelete("cascade"),
		uniqueIndex("migrations_org_env_id_unique").on(
			table.org_id,
			table.env,
			table.id,
		),
	],
);

export type Migration = typeof migrations.$inferSelect;
export type MigrationInsert = typeof migrations.$inferInsert;
