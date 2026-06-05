import type { ConsoleLogger, ConsoleLoggerLevel, LogArgs } from "../types.js";

export const createConsoleLogger = ({
	level,
}: {
	level: ConsoleLoggerLevel;
}): ConsoleLogger => {
	const levels: ConsoleLoggerLevel[] = ["debug", "info", "warning", "error"];
	const min = levels.indexOf(level);
	const noop = () => {};
	const log =
		({ method }: { method: "debug" | "info" | "warn" | "error" }) =>
		(...args: LogArgs) => {
			console[method](...args);
		};

	const logger: ConsoleLogger = {
		level,
		debug: min <= 0 ? log({ method: "debug" }) : noop,
		info: min <= 1 ? log({ method: "info" }) : noop,
		warn: min <= 2 ? log({ method: "warn" }) : noop,
		warning: min <= 2 ? log({ method: "warn" }) : noop,
		error: min <= 3 ? log({ method: "error" }) : noop,
		child: () => logger,
	};

	return logger;
};
