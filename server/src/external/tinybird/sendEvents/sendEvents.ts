import * as crypto from "node:crypto";
import type { EventInsert } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { isTinybirdConfigured, tinybirdIngest } from "../initTinybird.js";
import { mapToTinybirdEvent } from "./mapEvent.js";

/** Generate a unique error ID for tracking */
const generateErrorId = (): string => {
	return `TB_ERR_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
};

/**
 * Send EventInsert[] to Tinybird using zod-bird client.
 * The zod-bird client has built-in retry logic (10 retries with exponential backoff).
 * Does not throw - logs and captures errors in Sentry instead.
 */
export const sendEventsToTinybird = async ({
	events,
	logger,
}: {
	events: EventInsert[];
	logger?: Logger;
}): Promise<void> => {
	if (events.length === 0) {
		return;
	}

	if (!isTinybirdConfigured() || !tinybirdIngest) {
		logger?.debug("Tinybird not configured, skipping event send");
		return;
	}

	const tinybirdEvents = events.map(mapToTinybirdEvent);

	try {
		const result = await tinybirdIngest.events(tinybirdEvents);
		logger?.debug(
			{
				eventCount: events.length,
				successfulRows: result.successful_rows,
				quarantinedRows: result.quarantined_rows,
			},
			`Sent ${events.length} events to Tinybird`,
		);
	} catch (error) {
		// All retries exhausted - log error with unique ID and capture in Sentry
		const errorId = generateErrorId();
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger?.error(
			{
				errorId,
				eventCount: events.length,
				error: errorMessage,
				eventIds: events.slice(0, 10).map((e) => e.id),
			},
			`[${errorId}] Failed to send events to Tinybird`,
		);

		Sentry.captureException(error, {
			tags: {
				errorId,
				service: "tinybird",
			},
			extra: {
				eventCount: events.length,
				eventIds: events.slice(0, 10).map((e) => e.id),
			},
		});
	}
};
