import type { RepoContext } from "@/db/repoContext.js";
import {
	migrationTinybird,
	type TinybirdMigrationItemEvent,
} from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { normalizeMigrationItemEventJson } from "./listMigrationItemEvents.js";

export const listLatestMigrationItemEvents = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	dryRun,
	limit = 100000,
}: {
	ctx: RepoContext;
	migrationInternalId: string;
	migrationRunId: string;
	dryRun: boolean;
	limit?: number;
}): Promise<TinybirdMigrationItemEvent[]> => {
	if (!migrationTinybird) {
		ctx.logger.debug(
			"Tinybird not configured, skipping latest migration item event list",
		);
		return [];
	}

	const result = await migrationTinybird.listItemEvents.query({
		org_id: ctx.org.id,
		env: ctx.env,
		migration_internal_id: migrationInternalId,
		migration_run_id: migrationRunId,
		limit,
	});

	const latestByItem = new Map<string, TinybirdMigrationItemEvent>();
	for (const event of (result.data as TinybirdMigrationItemEvent[]).map(
		normalizeMigrationItemEventJson,
	)) {
		if (event.dry_run !== dryRun) continue;
		const key = `${event.item_kind}:${event.item_id}`;
		if (!latestByItem.has(key)) latestByItem.set(key, event);
	}

	return [...latestByItem.values()].sort((a, b) => {
		if (a.item_kind !== b.item_kind) {
			return a.item_kind.localeCompare(b.item_kind);
		}
		return a.item_id.localeCompare(b.item_id);
	});
};
