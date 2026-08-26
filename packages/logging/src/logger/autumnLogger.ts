import type pino from "pino";
import type {
	AutumnLogger,
	ConsoleLoggerLevel,
	CreateLoggerParams,
	LogArgs,
} from "../types.js";
import { createLogger } from "./createLogger.js";
import {
	errorToObject,
	normalizeErrorValues,
	rewriteAppPath,
} from "./normalizeErrors.js";

const normalizeLogArgs = ({ args }: { args: LogArgs }) => {
	const strings = args
		.filter((arg): arg is string => typeof arg === "string")
		.map(rewriteAppPath);
	const objects = args
		.filter(
			(arg) => typeof arg !== "string" && arg !== null && arg !== undefined,
		)
		.map((arg) =>
			arg instanceof Error
				? { error: errorToObject(arg) }
				: normalizeErrorValues(arg),
		);
	const error = args.find((arg): arg is Error => arg instanceof Error);
	const message =
		strings[strings.length - 1] ??
		(error
			? rewriteAppPath(error.stack || error.message || "Error occurred")
			: "");

	return {
		message,
		merged: Object.assign({}, ...objects) as Record<string, unknown>,
	};
};

const createLogMethod =
	({ level, logger }: { level: pino.Level; logger: pino.Logger }) =>
	(...args: LogArgs) => {
		if (!logger.isLevelEnabled(level)) return;
		const { message, merged } = normalizeLogArgs({ args });
		if (Object.keys(merged).length > 0) logger[level](merged, message);
		else logger[level](message);
	};

const noopFlush = async () => {};

export const createAutumnLogger = ({
	flush = noopFlush,
	logger,
}: {
	flush?: () => Promise<void>;
	logger: pino.Logger;
}): AutumnLogger => ({
	level: logger.level as ConsoleLoggerLevel,
	debug: createLogMethod({ level: "debug", logger }),
	info: createLogMethod({ level: "info", logger }),
	warn: createLogMethod({ level: "warn", logger }),
	warning: createLogMethod({ level: "warn", logger }),
	error: createLogMethod({ level: "error", logger }),
	flush,
	child: ({ context, onlyProd = false }) => {
		if (onlyProd && process.env.NODE_ENV !== "production") {
			return createAutumnLogger({ flush, logger });
		}
		return createAutumnLogger({ flush, logger: logger.child(context) });
	},
});

export const createAppLogger = (params: CreateLoggerParams): AutumnLogger => {
	const { flushTransports, logger } = createLogger(params);
	return createAutumnLogger({ flush: flushTransports, logger });
};
