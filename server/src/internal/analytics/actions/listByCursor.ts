import type {
	ApiEventsListItem,
	CursorPaginatedResponse,
	TrackDeduction,
} from "@autumn/shared";
import { ErrCode, RecaseError, StandardCursor } from "@autumn/shared";
import {
	epochMicrosToDateTime,
	epochToDateTime,
	tinybirdTimestampToEpochMicros,
	tinybirdTimestampToEpochMs,
} from "@autumn/shared/api/common/epochUtils";
import { subDays } from "date-fns";
import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { ListEventsCursorPipeParams } from "@/external/tinybird/pipes/listEventsCursorPipe.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validatePropertyPathForJSON } from "@/internal/analytics/actions/eventValidationUtils.js";

const RECENT_WINDOW_DAYS = [1, 7, 30];

const queryListEventsCursor = async (params: ListEventsCursorPipeParams) => {
	try {
		return await getTinybirdPipes().listEventsCursor(params);
	} catch (error) {
		if (error instanceof Error && error.message.includes("Timeout exceeded")) {
			throw new RecaseError({
				message:
					"Listing events timed out; narrow the time range or add filters",
				code: ErrCode.RequestTimeout,
				statusCode: 504,
			});
		}
		throw error;
	}
};

const queryRecentWindowsFirst = async ({
	params,
	anchorMs,
	rangeStartMs,
}: {
	params: ListEventsCursorPipeParams & { limit: number };
	anchorMs: number;
	rangeStartMs?: number;
}) => {
	for (const days of RECENT_WINDOW_DAYS) {
		const windowStartMs = subDays(anchorMs, days).getTime();
		if (rangeStartMs !== undefined && windowStartMs <= rangeStartMs) break;

		const result = await queryListEventsCursor({
			...params,
			start_date: epochToDateTime(windowStartMs),
		});
		if (result.data.length >= params.limit) return result;
	}

	return queryListEventsCursor(params);
};

export const listByCursor = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer_id?: string;
		entity_id?: string;
		feature_ids?: string[];
		custom_range?: { start?: number; end?: number };
		start_cursor: string;
		limit: number;
		filter_by?: Record<string, string>;
	};
}): Promise<CursorPaginatedResponse<ApiEventsListItem>> => {
	const { org, env } = ctx;

	const cursor = StandardCursor.decode(params.start_cursor);

	const startDate = params.custom_range?.start
		? epochToDateTime(params.custom_range.start)
		: undefined;
	const endDate = params.custom_range?.end
		? epochToDateTime(params.custom_range.end)
		: undefined;

	const fetchLimit = params.limit + 1;

	ctx.logger.debug("Listing events via cursor", {
		customerId: params.customer_id,
		featureIds: params.feature_ids,
		startDate,
		endDate,
		cursor,
		limit: params.limit,
	});

	// Build filter_by indexed params
	const filterParams: Record<string, string> = {};
	if (params.filter_by) {
		const entries = Object.entries(params.filter_by).slice(0, 5);
		for (let i = 0; i < entries.length; i++) {
			const [key, value] = entries[i];
			validatePropertyPathForJSON({ propertyKey: key });
			filterParams[`filter_key_${i}`] = key;
			filterParams[`filter_value_${i}`] = value;
		}
	}

	const pipeParams = {
		org_id: org.id,
		env,
		start_date: startDate,
		end_date: endDate,
		customer_id: params.customer_id,
		entity_id: params.entity_id,
		event_names: params.feature_ids,
		limit: fetchLimit,
		...(cursor
			? {
					cursor_timestamp: epochMicrosToDateTime(cursor.t),
					cursor_id: cursor.id,
				}
			: {}),
		...filterParams,
	};

	const startTime = performance.now();
	const result = params.customer_id
		? await queryRecentWindowsFirst({
				params: pipeParams,
				anchorMs: cursor
					? Math.floor(cursor.t / 1000)
					: (params.custom_range?.end ?? Date.now()),
				rangeStartMs: params.custom_range?.start,
			})
		: await queryListEventsCursor(pipeParams);

	const queryDuration = performance.now() - startTime;
	const hasMore = result.data.length > params.limit;
	const rows = hasMore ? result.data.slice(0, params.limit) : result.data;

	let lastRowMicros: number | null = null;
	let lastRowId: string | null = null;

	// Transform to API format
	const list: ApiEventsListItem[] = rows.map((row) => {
		let properties = {};
		if (row.properties) {
			try {
				properties = JSON.parse(row.properties);
			} catch {
				// Invalid JSON, use empty object
			}
		}

		let deductions: TrackDeduction[] | null = null;
		if (row.deductions) {
			try {
				const parsed = JSON.parse(row.deductions);
				// Tinybird's JSON column re-encodes nested-object array items
				// as strings; second parse brings them back to TrackDeduction.
				const rawList = Array.isArray(parsed)
					? parsed
					: parsed && Array.isArray(parsed.list)
						? parsed.list
						: null;
				if (rawList) {
					deductions = rawList.map((item: unknown) => {
						if (typeof item !== "string") return item as TrackDeduction;
						try {
							return JSON.parse(item) as TrackDeduction;
						} catch {
							return item as unknown as TrackDeduction;
						}
					});
				}
			} catch {}
		}

		lastRowMicros = tinybirdTimestampToEpochMicros(row.timestamp);
		lastRowId = row.id;

		return {
			id: row.id,
			timestamp: tinybirdTimestampToEpochMs(row.timestamp),
			feature_id: row.event_name,
			customer_id: row.customer_id,
			value: row.value ?? 0,
			properties,
			deductions,
		};
	});

	const next_cursor =
		hasMore && lastRowId !== null && lastRowMicros !== null
			? StandardCursor.encode({
					id: lastRowId,
					t: lastRowMicros,
				})
			: null;

	ctx.logger.debug("Events listByCursor result", {
		queryMs: Math.round(queryDuration),
		rowCount: list.length,
		hasMore,
	});

	return {
		list,
		next_cursor,
	};
};
