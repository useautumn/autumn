import type { RepoContext } from "@/db/repoContext.js";
import {
	migrationTinybird,
	type TinybirdMigrationItemEvent,
} from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { findMigration } from "../findMigration.js";

const parseJsonish = (value: unknown): unknown => {
	if (typeof value !== "string") {
		if (Array.isArray(value)) return value.map(parseJsonish);
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [key, parseJsonish(entry)]),
			);
		}
		return value;
	}

	const trimmed = value.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;

	try {
		return parseJsonish(JSON.parse(value));
	} catch {
		return value;
	}
};

export const normalizeMigrationItemEventJson = (
	event: TinybirdMigrationItemEvent,
): TinybirdMigrationItemEvent => ({
	...event,
	item_preview: parseJsonish(event.item_preview) as TinybirdMigrationItemEvent["item_preview"],
	response: parseJsonish(event.response) as TinybirdMigrationItemEvent["response"],
});

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
	const queryParams = {
		org_id: ctx.org.id,
		env: ctx.env,
		migration_internal_id: migration.internal_id,
		migration_run_id: migrationRunId,
		limit: 1000,
	};
	ctx.logger.info(
		`listMigrationItemEvents: querying org=${queryParams.org_id} env=${queryParams.env} migration=${queryParams.migration_internal_id}`,
	);
	const result = await migrationTinybird.listItemEvents.query(queryParams);
	ctx.logger.info(
		`listMigrationItemEvents: got ${result.data.length} results`,
	);

	return (result.data as TinybirdMigrationItemEvent[]).map(
		normalizeMigrationItemEventJson,
	);
};
