import type pino from "pino";
import type { ErrorClassifier } from "../models/errorClassifier.js";
import { type ErrorLog, prepareErrorLog } from "./prepareErrorLog.js";

type LogMethodHook = NonNullable<pino.LoggerOptions["hooks"]>["logMethod"];

/** Installed as pino's `hooks.logMethod`. Our own logic can never break the log line or the process. */
export const createErrorLogHook = ({
	service,
	captureToSentry,
	loggerFramePaths = [],
	classifiers = [],
}: {
	service: string;
	captureToSentry: boolean;
	/** The app's own logger wrapper files, so a text-only error points at the real call site. */
	loggerFramePaths?: string[];
	/** App-specific rules (e.g. which dependency failures are transient), tried before the built-in ones. */
	classifiers?: ErrorClassifier[];
}): LogMethodHook =>
	function errorLogHook(this: pino.Logger, args, method, level) {
		let errorLog: ErrorLog | undefined;
		try {
			errorLog = prepareErrorLog({
				logger: this,
				args,
				level,
				service,
				captureToSentry,
				loggerFramePaths,
				classifiers,
			});
		} catch {}

		method.apply(this, (errorLog?.args ?? args) as Parameters<pino.LogFn>);

		try {
			errorLog?.capture?.();
		} catch {}
	};
