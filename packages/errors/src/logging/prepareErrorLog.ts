import type pino from "pino";
import { classifyError } from "../classify/classifyError.js";
import { captureErrorToSentry } from "../external/sentry/captureErrorToSentry.js";
import { captureLoggedMessageToSentry } from "../external/sentry/captureLoggedMessageToSentry.js";
import type { ErrorClassifier } from "../models/errorClassifier.js";
import type { LogContext } from "../models/logContext.js";
import { kindToReportPolicy } from "../report/reportPolicy.js";
import { annotateLoggedError } from "./annotateLoggedError.js";
import { findLoggedError } from "./findLoggedError.js";

const ERROR_LEVEL = 50;

export type ErrorLog = {
	args: unknown[];
	capture?: () => void;
};

const logContextOf = ({
	logger,
	args,
}: {
	logger: pino.Logger;
	args: unknown[];
}): LogContext => {
	const fields = args.find(
		(arg): arg is Record<string, unknown> =>
			typeof arg === "object" && arg !== null,
	);
	return { ...logger.bindings(), ...fields };
};

const messageOf = ({ args }: { args: unknown[] }): string =>
	args.filter((arg): arg is string => typeof arg === "string").at(-1) ??
	"Logged error";

/** Decides what a log call writes and, for an error-level bug, what it sends to Sentry. */
export const prepareErrorLog = ({
	logger,
	args,
	level,
	service,
	captureToSentry,
	loggerFramePaths,
	classifiers,
}: {
	logger: pino.Logger;
	args: unknown[];
	level: number;
	service: string;
	captureToSentry: boolean;
	loggerFramePaths: string[];
	classifiers: ErrorClassifier[];
}): ErrorLog => {
	const isErrorLevel = level >= ERROR_LEVEL;
	const loggedError = findLoggedError({ args });

	if (!loggedError) {
		if (!captureToSentry || !isErrorLevel) return { args };

		// Captured here, synchronously, so the stack still reaches the caller of logger.error.
		const stack = new Error().stack ?? "";
		const message = messageOf({ args });
		const logContext = logContextOf({ logger, args });
		return {
			args,
			capture: () =>
				captureLoggedMessageToSentry({
					message,
					stack,
					service,
					logContext,
					loggerFramePaths,
				}),
		};
	}

	const classification = classifyError({
		error: loggedError.error,
		classifiers,
	});
	const annotatedArgs = annotateLoggedError({
		args,
		loggedError,
		classification,
	});
	const isCaptured =
		captureToSentry &&
		isErrorLevel &&
		kindToReportPolicy({ kind: classification.kind }).captureToSentry;
	if (!isCaptured) return { args: annotatedArgs };

	const logContext = logContextOf({ logger, args });
	return {
		args: annotatedArgs,
		capture: () =>
			captureErrorToSentry({
				error: loggedError.error,
				service,
				logContext,
				classification,
			}),
	};
};
