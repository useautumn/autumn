import type pino from "pino";
import type {
	AutumnLogger,
	ConsoleLoggerLevel,
	CreateLoggerParams,
	LogArgs,
} from "../types.js";
import { createLogger } from "./createLogger.js";

const rewriteAppPath = (value: string): string =>
	value.replace("file:///app/", "./").replace(/\/app\//g, "./");

const errorToObject = (error: Error) => ({
	name: error.name,
	message: error.message,
	stack: error.stack ? rewriteAppPath(error.stack) : undefined,
});

const normalizeLogArgs = ({ args }: { args: LogArgs }) => {
	const strings = args
		.filter((arg): arg is string => typeof arg === "string")
		.map(rewriteAppPath);
	const objects = args
		.filter(
			(arg) => typeof arg !== "string" && arg !== null && arg !== undefined,
		)
		.map((arg) => (arg instanceof Error ? { error: errorToObject(arg) } : arg));
	const error = args.find((arg): arg is Error => arg instanceof Error);
	const message =
		strings.at(-1) ??
		(error
			? rewriteAppPath(error.stack || error.message || "Error occurred")
			: "");

	return {
		message,
		merged: Object.assign({}, ...objects) as Record<string, unknown>,
	};
};

const createLogMethod =
	({ method }: { method: pino.LogFn }) =>
	(...args: LogArgs) => {
		const { message, merged } = normalizeLogArgs({ args });
		if (Object.keys(merged).length > 0) method(merged, message);
		else method(message);
	};

export const createAutumnLogger = ({
	logger,
}: {
	logger: pino.Logger;
}): AutumnLogger => ({
	level: logger.level as ConsoleLoggerLevel,
	debug: createLogMethod({ method: logger.debug.bind(logger) }),
	info: createLogMethod({ method: logger.info.bind(logger) }),
	warn: createLogMethod({ method: logger.warn.bind(logger) }),
	warning: createLogMethod({ method: logger.warn.bind(logger) }),
	error: createLogMethod({ method: logger.error.bind(logger) }),
	child: ({ context, onlyProd = false }) => {
		if (onlyProd && process.env.NODE_ENV !== "production") {
			return createAutumnLogger({ logger });
		}
		return createAutumnLogger({ logger: logger.child(context) });
	},
});

export const createAppLogger = (params: CreateLoggerParams): AutumnLogger =>
	createAutumnLogger({ logger: createLogger(params) });
