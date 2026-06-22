import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getStandardIntervalWindow } from "../analyticsUtils.js";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

/** Lists distinct event names for the org sorted by popularity. With an
 * interval, ranks by count within that window so callers can default to events
 * that are actually active in the selected range. */
export const listEventNames = async ({
	ctx,
	limit,
	interval,
}: {
	ctx: AutumnContext;
	limit?: number;
	interval?: string;
}): Promise<EventNameWithCount[]> => {
	const { org, env } = ctx;
	const pipes = getTinybirdPipes();
	const window = getStandardIntervalWindow(interval);

	const result = await pipes.listEventNames({
		org_id: org.id,
		env,
		limit,
		start_date: window?.startDate,
		end_date: window?.endDate,
	});

	return result.data;
};
