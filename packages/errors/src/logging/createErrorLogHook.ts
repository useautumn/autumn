import type pino from "pino";
import { type ErrorLog, prepareErrorLog } from "./prepareErrorLog.js";

type LogMethodHook = NonNullable<pino.LoggerOptions["hooks"]>["logMethod"];

/** Installed as pino's `hooks.logMethod`. Our own logic can never break the log line or the process. */
export const createErrorLogHook = ({
	service,
	captureToSentry,
}: {
	service: string;
	captureToSentry: boolean;
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
			});
		} catch {}

		method.apply(this, (errorLog?.args ?? args) as Parameters<pino.LogFn>);

		try {
			errorLog?.capture?.();
		} catch {}
	};
