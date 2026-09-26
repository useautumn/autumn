import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getEventRankingWindow } from "../analyticsUtils.js";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

/** Lists distinct event names for the org sorted by popularity. With an
 * interval or custom range, ranks by count within that window so callers can
 * default to events that are actually active in the selected range. */
export const listEventNames = async ({
	ctx,
	customerId,
	entityId,
	limit,
	interval,
	binSize,
	customRange,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	limit?: number;
	interval?: string;
	binSize?: string;
	customRange?: { start: number; end: number };
}): Promise<EventNameWithCount[]> => {
	const { org, env } = ctx;
	const pipes = getTinybirdPipes();
	const window = getEventRankingWindow({ interval, binSize, customRange });

	const result = await pipes.listEventNames({
		org_id: org.id,
		env,
		customer_id: customerId,
		entity_id: entityId,
		limit,
		start_date: window?.startDate,
		end_date: window?.endDate,
	});

	return result.data;
};
