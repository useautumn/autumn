import type { RepoContext } from "@/db/repoContext.js";
import {
	migrationTinybird,
	type TinybirdMigrationItemEvent,
} from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { findMigration } from "../findMigration.js";

export const listMigrationItemEvents = async ({
	ctx,
	migrationId,
	migrationRunId,
}: {
	ctx: RepoContext;
	migrationId: string;
	migrationRunId?: string;
}): Promise<TinybirdMigrationItemEvent[]> => {
	if (!migrationTinybird) {
		ctx.logger.debug(
			"Tinybird not configured, skipping migration item event list",
		);
		return [];
	}

	const migration = await findMigration({ ctx, id: migrationId });
	const result = await migrationTinybird.listItemEvents.query({
		org_id: ctx.org.id,
		env: ctx.env,
		migration_internal_id: migration.internal_id,
		migration_run_id: migrationRunId,
		limit: 1000,
	});

	return result.data as TinybirdMigrationItemEvent[];
};
