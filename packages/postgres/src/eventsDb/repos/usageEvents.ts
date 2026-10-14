import { type EventInsert, events } from "@autumn/shared";
import { and, inArray, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { postgresSqlStateOf } from "../../common/postgresErrors.js";
import type { PostgresDb } from "../../types/postgresClient.js";

const ROWS_PER_INSERT = 1_000;
const ROW_REFUSED_SQLSTATE = /^(22|23)/;

export type RefusedUsageEvent = { event: EventInsert; cause: unknown };

export type UsageEventsInsertResult = {
	insertedIds: string[];
	refused: RefusedUsageEvent[];
};

const isRowRefusal = (cause: unknown): boolean =>
	ROW_REFUSED_SQLSTATE.test(postgresSqlStateOf({ error: cause }) ?? "");

export const insertIsolatingRefusals = async ({
	insertRows,
	rows,
	result,
}: {
	insertRows: (rows: EventInsert[]) => Promise<string[]>;
	rows: EventInsert[];
	result: UsageEventsInsertResult;
}): Promise<void> => {
	try {
		result.insertedIds.push(...(await insertRows(rows)));
	} catch (cause) {
		if (!isRowRefusal(cause)) throw cause;
		const [only] = rows;
		if (rows.length === 1 && only) {
			result.refused.push({ event: only, cause });
			return;
		}
		const middle = Math.ceil(rows.length / 2);
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(0, middle),
			result,
		});
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(middle),
			result,
		});
	}
};

const USAGE_EVENT_COLUMNS = [
	["id", "text"],
	["org_id", "text"],
	["org_slug", "text"],
	["internal_customer_id", "text"],
	["env", "text"],
	["created_at", "bigint"],
	["timestamp", "timestamptz"],
	["event_name", "text"],
	["idempotency_key", "text"],
	["value", "numeric"],
	["set_usage", "boolean"],
	["entity_id", "text"],
	["internal_entity_id", "text"],
	["internal_product_id", "text"],
	["customer_id", "text"],
	["properties", "jsonb"],
	["deductions", "jsonb"],
] as const;

const INSERT_USAGE_EVENTS_SQL = `insert into events (${USAGE_EVENT_COLUMNS.map(([column]) => `"${column}"`).join(", ")})
select ${USAGE_EVENT_COLUMNS.map(([column, type]) => (type === "jsonb" ? `"${column}"::jsonb` : `"${column}"`)).join(", ")}
from unnest(${USAGE_EVENT_COLUMNS.map(([, type], i) => `$${i + 1}::${type === "jsonb" ? "text" : type}[]`).join(", ")})
as rows(${USAGE_EVENT_COLUMNS.map(([column]) => `"${column}"`).join(", ")})
on conflict do nothing
returning id`;

const jsonOrNull = (value: unknown): string | null =>
	value === null || value === undefined ? null : JSON.stringify(value);

const usageEventsToColumnArrays = (rows: EventInsert[]): unknown[][] => [
	rows.map((row) => row.id),
	rows.map((row) => row.org_id),
	rows.map((row) => row.org_slug),
	rows.map((row) => row.internal_customer_id ?? null),
	rows.map((row) => row.env),
	rows.map((row) => row.created_at ?? null),
	rows.map((row) => row.timestamp?.toISOString() ?? null),
	rows.map((row) => row.event_name),
	rows.map((row) => row.idempotency_key ?? null),
	rows.map((row) => row.value ?? null),
	rows.map((row) => row.set_usage ?? false),
	rows.map((row) => row.entity_id ?? null),
	rows.map((row) => row.internal_entity_id ?? null),
	rows.map((row) => row.internal_product_id ?? null),
	rows.map((row) => row.customer_id),
	rows.map((row) => jsonOrNull(row.properties)),
	rows.map((row) => jsonOrNull(row.deductions)),
];

export const insertUsageEvents = async ({
	ctx,
	events: rows,
}: {
	ctx: { client: Pick<Pool, "query"> };
	events: EventInsert[];
}): Promise<UsageEventsInsertResult> => {
	const result: UsageEventsInsertResult = { insertedIds: [], refused: [] };
	const insertRows = async (chunk: EventInsert[]): Promise<string[]> => {
		const inserted = await ctx.client.query<{ id: string }>(
			INSERT_USAGE_EVENTS_SQL,
			usageEventsToColumnArrays(chunk),
		);
		return inserted.rows.map((row) => row.id);
	};
	for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
		await insertIsolatingRefusals({
			insertRows,
			rows: rows.slice(start, start + ROWS_PER_INSERT),
			result,
		});
	}
	return result;
};

export const readUnsentToTinybirdIds = async ({
	ctx,
	ids,
}: {
	ctx: { db: PostgresDb };
	ids: string[];
}): Promise<string[]> => {
	if (ids.length === 0) return [];
	const rows = await ctx.db
		.select({ id: events.id })
		.from(events)
		.where(and(inArray(events.id, ids), isNull(events.sent_to_tinybird_at)));
	return rows.map((row) => row.id);
};

export const markSentToTinybird = async ({
	ctx,
	ids,
	at,
}: {
	ctx: { db: PostgresDb };
	ids: string[];
	at: Date;
}): Promise<void> => {
	if (ids.length === 0) return;
	await ctx.db
		.update(events)
		.set({ sent_to_tinybird_at: at })
		.where(inArray(events.id, ids));
};
