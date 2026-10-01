import type { SDKOptions } from "../lib/config.js";
import { env } from "../lib/env.js";
import type { Logger } from "../lib/logger.js";
import type { SDKInitHook } from "./types.js";

const AUTHORIZATION_LINE = /^(authorization:\s*).+$/i;

const redactAuthorization = (value: unknown) =>
	typeof value === "string"
		? value.replace(AUTHORIZATION_LINE, "$1[REDACTED]")
		: value;

const redactingLogger = (logger: Logger): Logger => ({
	group: (label) => logger.group(label),
	groupEnd: () => logger.groupEnd(),
	log: (message, ...args) => logger.log(redactAuthorization(message), ...args),
});

/** Debug logs print request headers, so mask the secret key before any logger sees it. */
export class RedactDebugLogHook implements SDKInitHook {
	sdkInit(opts: SDKOptions): SDKOptions {
		const logger = opts.debugLogger ?? (env().AUTUMN_DEBUG ? console : null);
		if (!logger) return opts;

		return { ...opts, debugLogger: redactingLogger(logger) };
	}
}
