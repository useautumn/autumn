import type {
	BillingCycleResult,
	ClickHouseResult,
	FullCustomer,
} from "@autumn/shared";
import {
	getTinybirdPipes,
	type ListEventsPipeRow,
} from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingCycleStartDate } from "../analyticsUtils.js";

const DEFAULT_LIMIT = 1000;

const formatJsDateToClickHouseDateTime = (date: Date): string => {
	return date.toISOString().slice(0, 19).replace("T", " ");
};

const calculateStartDateFromInterval = (interval: string): Date => {
	const startDate = new Date();

	switch (interval) {
		case "24h":
			startDate.setHours(startDate.getHours() - 24);
			break;
		case "7d":
			startDate.setDate(startDate.getDate() - 7);
			break;
		case "30d":
			startDate.setDate(startDate.getDate() - 30);
			break;
		case "90d":
			startDate.setDate(startDate.getDate() - 90);
			break;
		default:
			// Default to 30 days
			startDate.setDate(startDate.getDate() - 30);
			break;
	}

	return startDate;
};

export type LegacyListRawEventsParams = {
	customer_id?: string;
	interval?: string;
	customer?: FullCustomer;
	aggregateAll?: boolean;
	event_name?: string;
	limit?: number;
	cursor_timestamp?: string;
	cursor_id?: string;
};

/**
 * @deprecated Use listRawEvents instead. This uses the legacy list_events pipe
 * which returns additional fields (idempotency_key, entity_id, org_id, env).
 */
export const _legacyListRawEvents = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: LegacyListRawEventsParams;
}): Promise<ClickHouseResult<ListEventsPipeRow>> => {
	const pipes = getTinybirdPipes();
	const { org, env, db } = ctx;

	const intervalType = params.interval ?? "30d";
	const isBillingCycle = intervalType === "1bc" || intervalType === "3bc";

	// Calculate billing cycle dates if needed
	const billingCycleResult =
		isBillingCycle && !params.aggregateAll && params.customer
			? ((await getBillingCycleStartDate(
					params.customer,
					db,
					intervalType as "1bc" | "3bc",
				)) as BillingCycleResult | null)
			: null;

	// Calculate date range
	const startDate = calculateStartDateFromInterval(intervalType);

	const finalStartDate =
		isBillingCycle && billingCycleResult?.startDate
			? billingCycleResult.startDate
			: formatJsDateToClickHouseDateTime(startDate);

	const finalEndDate =
		isBillingCycle && billingCycleResult?.endDate
			? billingCycleResult.endDate
			: formatJsDateToClickHouseDateTime(new Date());

	const pipeParams = {
		org_id: org.id,
		env,
		start_date: finalStartDate,
		end_date: finalEndDate,
		customer_id: params.aggregateAll ? undefined : params.customer_id,
		event_name: params.event_name,
		cursor_timestamp: params.cursor_timestamp,
		cursor_id: params.cursor_id,
		limit: params.limit ?? DEFAULT_LIMIT,
	};

	ctx.logger.debug(
		"[_legacyListRawEvents] Querying via legacy list_events pipe",
		{
			customerId: params.customer_id,
			aggregateAll: params.aggregateAll,
			startDate: finalStartDate,
			endDate: finalEndDate,
			limit: pipeParams.limit,
		},
	);

	const startTime = performance.now();
	const result = await pipes.listEvents(pipeParams);
	const queryDuration = performance.now() - startTime;

	ctx.logger.debug("[_legacyListRawEvents] Result", {
		queryMs: Math.round(queryDuration),
		rowCount: result.data.length,
	});

	return {
		meta: [
			{ name: "id" },
			{ name: "org_id" },
			{ name: "env" },
			{ name: "customer_id" },
			{ name: "event_name" },
			{ name: "timestamp" },
			{ name: "value" },
			{ name: "properties" },
			{ name: "idempotency_key" },
			{ name: "entity_id" },
		],
		rows: result.data.length,
		data: result.data,
	};
};
