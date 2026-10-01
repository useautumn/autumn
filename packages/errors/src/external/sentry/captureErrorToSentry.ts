import * as Sentry from "@sentry/bun";
import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";
import { logContextToSentryEvent } from "./logContextToSentryEvent.js";

/** An error can name its own Sentry issue, e.g. one per job, when its stack is shared. */
const fingerprintOf = (error: Error): string[] | undefined =>
	"fingerprint" in error && Array.isArray(error.fingerprint)
		? error.fingerprint.map(String)
		: undefined;

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
	const fingerprint = fingerprintOf(error);
	Sentry.captureException(error, {
		...logContextToSentryEvent({ service, logContext, classification }),
		...(fingerprint && { fingerprint }),
	});
};
