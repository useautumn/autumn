import * as crypto from "node:crypto";
import type { EventInsert } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { tinybirdIngest } from "../initTinybird.js";
import { tinybirdSecondaryApi } from "../initTinybirdV2.js";
import { mapToTinybirdEvent } from "./mapEvent.js";

/** Generate a unique error ID for tracking */
const generateErrorId = (): string => {
	return `TB_ERR_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
};

/** Dual-write to Tinybird primary + secondary. Failures logged, never thrown. */
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

	if (!tinybirdIngest && !tinybirdSecondaryApi) {
		logger?.debug(
			"Tinybird not configured (neither primary nor secondary), skipping event send",
		);
		return;
	}

	const tinybirdEvents = events.map(mapToTinybirdEvent);

	const reportFailure = (error: unknown, region: "primary" | "secondary") => {
		const errorId = generateErrorId();
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger?.error(
			`[${errorId}] Failed to send events to Tinybird (${region})`,
			{
				data: {
					errorId,
					region,
					eventCount: events.length,
					error: errorMessage,
					events,
				},
			},
		);

		Sentry.captureException(error, {
			tags: {
				errorId,
				service: "tinybird",
				tinybird_region: region,
			},
			extra: {
				data: {
					eventCount: events.length,
					events,
				},
			},
		});
	};

	const primaryWrite = tinybirdIngest
		? tinybirdIngest
				.events(tinybirdEvents)
				.then((result) => {
					logger?.info(`Sent ${events.length} events to Tinybird (primary)`, {
						data: {
							region: "primary",
							eventCount: events.length,
							successfulRows: result.successful_rows,
							quarantinedRows: result.quarantined_rows,
						},
					});
				})
				.catch((error: unknown) => reportFailure(error, "primary"))
		: Promise.resolve();

	const secondaryWrite = tinybirdSecondaryApi
		? tinybirdSecondaryApi
				.ingestBatch("events", tinybirdEvents)
				.then((result) => {
					logger?.info(`Sent ${events.length} events to Tinybird (secondary)`, {
						data: {
							region: "secondary",
							eventCount: events.length,
							successfulRows: result?.successful_rows,
							quarantinedRows: result?.quarantined_rows,
						},
					});
				})
				.catch((error: unknown) => reportFailure(error, "secondary"))
		: Promise.resolve();

	await Promise.all([primaryWrite, secondaryWrite]);
};
