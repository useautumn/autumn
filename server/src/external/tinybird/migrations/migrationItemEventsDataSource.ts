import {
	defineDatasource,
	defineEndpoint,
	engine,
	type InferRow,
	node,
	p,
	Tinybird,
	t,
} from "@tinybirdco/sdk";

const TINYBIRD_US_EAST_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
const TINYBIRD_US_EAST_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

const migrationTinybirdConfig =
	TINYBIRD_US_EAST_API_URL && TINYBIRD_US_EAST_TOKEN
		? {
				baseUrl: TINYBIRD_US_EAST_API_URL,
				token: TINYBIRD_US_EAST_TOKEN,
			}
		: null;

export type MigrationItemEventStatus = "succeeded" | "skipped" | "failed";

export type MigrationItemPreview = {
	id?: string | null;
	name?: string | null;
	email?: string | null;
};

export type MigrationItemEventResponse = Record<string, unknown> | null;

export const migrationItemEventsDatasource = defineDatasource(
	"migration_item_events",
	{
		description: "One audit result row per migration item run.",
		schema: {
			timestamp: t.dateTime64(6),
			org_id: t.string(),
			env: t.string().lowCardinality(),
			migration_internal_id: t.string(),
			migration_run_id: t.string(),
			dry_run: t.bool(),
			item_kind: t.string().lowCardinality(),
			item_id: t.string(),
			item_preview: t.json<MigrationItemPreview | null>(),
			status: t.string<MigrationItemEventStatus>().lowCardinality(),
			response: t.json<MigrationItemEventResponse>(),
		},
		engine: engine.mergeTree({
			partitionKey: "toYYYYMM(timestamp)",
			sortingKey: [
				"org_id",
				"env",
				"migration_run_id",
				"item_kind",
				"item_id",
				"timestamp",
			],
		}),
	},
);

export type TinybirdMigrationItemEvent = InferRow<
	typeof migrationItemEventsDatasource
>;

export const listMigrationItemEventsEndpoint = defineEndpoint(
	"list_migration_item_events",
	{
		description: "List audit result rows for a migration run.",
		params: {
			org_id: p.string(),
			env: p.string(),
			migration_internal_id: p.string(),
			migration_run_id: p.string().optional(""),
			item_ids: p.array(p.string()).optional(),
			limit: p.int32().optional(1000),
		},
		nodes: [
			node({
				name: "endpoint",
				sql: `
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
					WHERE org_id = {{String(org_id)}}
						AND env = {{String(env)}}
						AND migration_internal_id = {{String(migration_internal_id)}}
						{% if defined(migration_run_id) and String(migration_run_id, '') != '' %}
							AND migration_run_id = {{String(migration_run_id)}}
						{% end %}
						{% if defined(item_ids) and length(item_ids) > 0 %}
							AND item_id IN {{Array(item_ids, 'String')}}
						{% end %}
					ORDER BY timestamp DESC, item_kind ASC, item_id ASC
					LIMIT {{Int32(limit, 1000)}}
				`,
			}),
		],
		output: {
			timestamp: t.dateTime64(6),
			org_id: t.string(),
			env: t.string().lowCardinality(),
			migration_internal_id: t.string(),
			migration_run_id: t.string(),
			dry_run: t.bool(),
			item_kind: t.string().lowCardinality(),
			item_id: t.string(),
			item_preview: t.json<MigrationItemPreview | null>(),
			status: t.string<MigrationItemEventStatus>().lowCardinality(),
			response: t.json<MigrationItemEventResponse>(),
		},
	},
);

export const migrationTinybird = migrationTinybirdConfig
	? new Tinybird({
			datasources: {
				itemEvents: migrationItemEventsDatasource,
			},
			pipes: {
				listItemEvents: listMigrationItemEventsEndpoint,
			},
			...migrationTinybirdConfig,
			devMode: false,
		})
	: null;
