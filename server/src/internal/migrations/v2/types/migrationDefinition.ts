import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import type { PreparedState } from "../prepare/types/index.js";

export type MigrationDefinition = {
	id: string;
	filter?: MigrationFilter | null;
	operations?: Operations | null;
	prepared_state?: PreparedState | null;
	no_billing_changes?: boolean | null;
	retry_failed?: boolean;
};

export type MigrationRuntime = Migration | MigrationDefinition;

export type MigrationRuntimeWithEventId = MigrationRuntime & {
	event_internal_id: string;
};

export const isPersistedMigration = (
	migration: MigrationRuntime,
): migration is Migration =>
	"internal_id" in migration && typeof migration.internal_id === "string";

/** The id migration_item_runs / item events are keyed by: the persisted
 * internal_id, or the deterministic script id for ad-hoc migrations. */
export const getMigrationEventInternalId = (
	migration: MigrationRuntimeWithEventId,
): string =>
	isPersistedMigration(migration)
		? migration.internal_id
		: migration.event_internal_id;

export const withMigrationEventId = ({
	orgId,
	env,
	migration,
}: {
	orgId: string;
	env: string;
	migration: MigrationRuntime;
}): MigrationRuntimeWithEventId => ({
	...migration,
	event_internal_id: isPersistedMigration(migration)
		? migration.internal_id
		: `script_${hashJson({ value: { orgId, env, id: migration.id } })}`,
});
