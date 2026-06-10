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

/**
 * Loose typing here — the structured `PreparedState` definition lives
 * server-side under `server/src/internal/migrations/v2/prepare/types.ts`
 * (alongside the prep modules that produce it). Server callers narrow as
 * needed via the Zod schema there.
 */
type LoosePreparedState = Record<string, unknown>;

/**
 * User-authored, customer-state-mutating migrations. Distinct from the
 * legacy `migration_jobs` table (product-version migration system).
 *
 * `internal_id` is the ksuid primary key; `id` is the user-provided
 * slug, unique per `(org_id, env)`. `filter` and `operations` are
 * typed jsonb blobs validated by the Zod schemas at
 * `shared/api/migrations/{filters,operations}/`.
 */
export const migrations = pgTable(
	"migrations",
	{
		internal_id: text().primaryKey().notNull(),
		id: text().notNull(),
		org_id: text().notNull(),
		env: text().notNull(),

		filter: jsonb().$type<MigrationFilter>(),
		operations: jsonb().$type<Operations>(),
		// Snapshot of the last successful prepare-run output, keyed by
		// module key. See shared/api/migrations/prepare/preparedStateTypes.ts.
		prepared_state: jsonb().$type<LoosePreparedState>(),

		// `null` (default) → infer from compute output.
		// `true` → force DB-only path; throw if any Stripe-relevant mutation slips in.
		// `false` → force Stripe path even when inference would say DB-only.
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
