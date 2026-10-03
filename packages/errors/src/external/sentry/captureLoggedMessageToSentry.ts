import * as Sentry from "@sentry/bun";
import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";
import { logContextToSentryEvent } from "./logContextToSentryEvent.js";
import { trimLoggerFrames } from "./trimLoggerFrames.js";

const LOGGED_MESSAGE_CLASSIFICATION: ErrorClassification = { kind: "bug" };

/** A text-only error line: titled by its message, located and grouped by the call site. */
export const captureLoggedMessageToSentry = ({
	message,
	stack,
	service,
	logContext,
	loggerFramePaths,
}: {
	message: string;
	stack: string;
	service: string;
	logContext: LogContext;
	loggerFramePaths: string[];
}) => {
	const stackParser = Sentry.getClient()?.getOptions().stackParser;
	if (!stackParser) return;

	const frames = trimLoggerFrames({
		frames: stackParser(stack),
		loggerFramePaths,
	});
	const callSite = frames.at(-1);

	Sentry.captureEvent({
		...logContextToSentryEvent({
			service,
			logContext,
			classification: LOGGED_MESSAGE_CLASSIFICATION,
		}),
		level: "error",
		message,
		exception: {
			values: [
				{
					type: logContext.error_type ?? "Error",
					value: message,
					stacktrace: { frames },
					mechanism: { type: "logger", handled: true },
				},
			],
		},
		fingerprint: [
			"logged-message",
			`${callSite?.filename ?? "unknown"}:${callSite?.function ?? "unknown"}`,
		],
	});
};
