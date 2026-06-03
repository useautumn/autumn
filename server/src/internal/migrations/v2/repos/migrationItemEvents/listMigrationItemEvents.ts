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
	itemIds,
}: {
	ctx: RepoContext;
	migrationId: string;
	migrationRunId?: string;
	itemIds?: string[];
}): Promise<TinybirdMigrationItemEvent[]> => {
	if (!migrationTinybird) {
		ctx.logger.debug(
			"Tinybird not configured, skipping migration item event list",
		);
		return [];
	}

	const migration = await findMigration({ ctx, id: migrationId });

	if (itemIds && itemIds.length > 0) {
		return listMigrationItemEventsBySql({
			ctx,
			orgId: ctx.org.id,
			env: ctx.env,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			itemIds,
		});
	}

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

const escapeString = (s: string) => s.replace(/'/g, "\\'");

const listMigrationItemEventsBySql = async ({
	ctx,
	orgId,
	env,
	migrationInternalId,
	migrationRunId,
	itemIds,
}: {
	ctx: RepoContext;
	orgId: string;
	env: string;
	migrationInternalId: string;
	migrationRunId?: string;
	itemIds: string[];
}): Promise<TinybirdMigrationItemEvent[]> => {
	const conditions = [
		`org_id = '${escapeString(orgId)}'`,
		`env = '${escapeString(env)}'`,
		`migration_internal_id = '${escapeString(migrationInternalId)}'`,
	];

	if (migrationRunId) {
		conditions.push(
			`migration_run_id = '${escapeString(migrationRunId)}'`,
		);
	}

	const idList = itemIds.map((id) => `'${escapeString(id)}'`).join(",");
	conditions.push(`item_id IN (${idList})`);

	const sql = `
		SELECT
			timestamp,
			org_id,
			env,
			migration_internal_id,
			migration_run_id,
			dry_run,
			item_kind,
			item_id,
			item_preview,
			status,
			response
		FROM migration_item_events
		WHERE ${conditions.join(" AND ")}
		ORDER BY timestamp DESC, item_kind ASC, item_id ASC
		LIMIT 1000
		FORMAT JSON
	`;

	ctx.logger.info(
		`listMigrationItemEventsBySql: querying ${itemIds.length} item_ids for migration=${migrationInternalId}`,
	);

	const result = await migrationTinybird!.sql<TinybirdMigrationItemEvent>(sql);
	const rows = result.data ?? [];

	ctx.logger.info(
		`listMigrationItemEventsBySql: got ${rows.length} results`,
	);

	return rows.map(normalizeMigrationItemEventJson);
};
