import * as Sentry from "@sentry/bun";
import { isStripeError } from "../../classify/stripe/isStripeError.js";
import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";
import { logContextToSentryEvent } from "./logContextToSentryEvent.js";

/** An error can name its own Sentry issue, e.g. one per job, when its stack is shared. */
const fingerprintOf = ({
	error,
	operation,
}: {
	error: Error;
	operation: string | undefined;
}): string[] | undefined => {
	if ("fingerprint" in error && Array.isArray(error.fingerprint))
		return error.fingerprint.map(String);
	// Every Stripe error's top frame is the SDK's, so the stack would put them all in one issue.
	if (isStripeError(error))
		return ["stripe", error.code ?? error.type, operation ?? "unknown"];
};

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
	const event = logContextToSentryEvent({
		service,
		logContext,
		classification,
	});
	const fingerprint = fingerprintOf({ error, operation: event.tags.operation });
	Sentry.captureException(error, {
		...event,
		...(fingerprint && { fingerprint }),
	});
};
