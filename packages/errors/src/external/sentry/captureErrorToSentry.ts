import * as Sentry from "@sentry/bun";
import { isStripeError } from "../../classify/stripe/isStripeError.js";
import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";
import { logContextToSentryEvent } from "./logContextToSentryEvent.js";

/** An error can name its own Sentry issue, e.g. one per job, when its stack is shared. */
const fingerprintOf = ({
	error,
	operation,
	env,
}: {
	error: Error;
	operation: string | undefined;
	env: string | undefined;
}): string[] | undefined => {
	if ("fingerprint" in error && Array.isArray(error.fingerprint))
		return error.fingerprint.map(String);
	if (!isStripeError(error)) return;

	const isWebhookOperation =
		operation === "stripe-webhook-replay" ||
		operation === "POST /webhooks/connect/:env" ||
		operation === "POST /webhooks/stripe/:orgId/:env" ||
		/^POST \/webhooks\/stripe\/[^/]+\/(live|sandbox)$/.test(operation ?? "");
	const hasWebhookEnvironment = env === "live" || env === "sandbox";
	const fingerprintOperation =
		isWebhookOperation && hasWebhookEnvironment
			? `POST /webhooks/connect/${env}`
			: operation;

	return [
		"stripe",
		error.code ?? error.type,
		fingerprintOperation ?? "unknown",
	];
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
	const fingerprint = fingerprintOf({
		error,
		operation: event.tags.operation,
		env: event.tags.env,
	});
	Sentry.captureException(error, {
		...event,
		...(fingerprint && { fingerprint }),
	});
};
