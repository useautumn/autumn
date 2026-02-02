import type { ApiEventsListItem } from "@autumn/shared";
import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Converts epoch ms to ClickHouse DateTime string format */
const epochToDateTime = (epochMs: number): string => {
	const date = new Date(epochMs);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/** Lists events for the external API with offset-based pagination */
export const listEventsForApi = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer_id?: string;
		feature_ids?: string[];
		custom_range?: { start?: number; end?: number };
		offset: number;
		limit: number;
	};
}) => {
	const pipes = getTinybirdPipes();
	const { org, env } = ctx;

	// Convert epoch ms to DateTime strings (if provided)
	const startDate = params.custom_range?.start
		? epochToDateTime(params.custom_range.start)
		: undefined;
	const endDate = params.custom_range?.end
		? epochToDateTime(params.custom_range.end)
		: undefined;

	// Fetch N+1 for has_more calculation
	const fetchLimit = params.limit + 1;

	ctx.logger.debug("Listing events for API via Tinybird", {
		customerId: params.customer_id,
		featureIds: params.feature_ids,
		startDate,
		endDate,
		offset: params.offset,
		limit: params.limit,
	});

	const startTime = performance.now();
	const result = await pipes.listEventsPaginated({
		org_id: org.id,
		env,
		start_date: startDate,
		end_date: endDate,
		customer_id: params.customer_id,
		event_names: params.feature_ids,
		limit: fetchLimit,
		offset: params.offset,
	});

	const queryDuration = performance.now() - startTime;
	const hasMore = result.data.length > params.limit;
	const rows = hasMore ? result.data.slice(0, params.limit) : result.data;

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

		return {
			id: row.id,
			timestamp: new Date(row.timestamp).getTime(),
			feature_id: row.event_name,
			customer_id: row.customer_id,
			value: row.value ?? 0,
			properties,
		};
	});

	ctx.logger.debug("Events list result", {
		queryMs: Math.round(queryDuration),
		rowCount: list.length,
		hasMore,
	});

	return {
		list,
		has_more: hasMore,
		total: list.length,
		offset: params.offset,
		limit: params.limit,
	};
};
