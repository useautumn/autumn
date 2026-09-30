import * as Sentry from "@sentry/bun";
import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";
import { logContextToSentryEvent } from "./logContextToSentryEvent.js";

/** Context goes on this one event, never the shared scope, so concurrent jobs can't swap tags. */
export const captureErrorToSentry = ({
	error,
	service,
	logContext,
	classification,
}: {
	error: Error;
	service: string;
	logContext: LogContext;
	classification: ErrorClassification;
}) => {
	Sentry.captureException(
		error,
		logContextToSentryEvent({ service, logContext, classification }),
	);
};
