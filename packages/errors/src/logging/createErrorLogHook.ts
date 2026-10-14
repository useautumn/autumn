import type pino from "pino";
import type { ErrorClassifier } from "../models/errorClassifier.js";
import { type ErrorLog, prepareErrorLog } from "./prepareErrorLog.js";

type LogMethodHook = NonNullable<pino.LoggerOptions["hooks"]>["logMethod"];

export const createErrorLogHook = ({
	service,
	captureToSentry,
	loggerFramePaths = [],
	classifiers = [],
}: {
	service: string;
	captureToSentry: boolean;
	loggerFramePaths?: string[];
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
