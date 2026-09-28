import type { AutumnLogger } from "@autumn/logging";
import type { EventInsert } from "@autumn/shared";
import { ingestRows } from "../../common/ingestRows.js";
import type { TinybirdClient } from "../../types/tinybirdClient.js";
import { usageEventToTinybirdRow } from "../usageEventToTinybirdRow.js";

const EVENTS_DATASOURCE = "events";
// A row is about 1 KB, so a request stays far under the Events API's 10 MB.
const ROWS_PER_REQUEST = 2_000;

export const sendUsageEvents = async ({
	ctx,
	events,
}: {
	ctx: { tinybird: TinybirdClient; logger: Pick<AutumnLogger, "error"> };
	events: EventInsert[];
}): Promise<void> => {
	if (events.length === 0) return;
	const reply = await ingestRows({
		ctx,
		datasource: EVENTS_DATASOURCE,
		rows: events.map((event) => usageEventToTinybirdRow({ event })),
		rowsPerRequest: ROWS_PER_REQUEST,
	});
	if (reply.quarantined_rows === 0) return;
	ctx.logger.error(
		{
			type: "tinybird_rows_quarantined",
			data: { quarantinedRows: reply.quarantined_rows },
		},
		"Tinybird quarantined usage events",
	);
};
