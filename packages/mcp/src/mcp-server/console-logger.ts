export const consoleLoggerLevels = [
	"debug",
	"info",
	"warning",
	"error",
] as const;

export type ConsoleLoggerLevel = (typeof consoleLoggerLevels)[number];

type LogMethod = (message: string, data?: Record<string, unknown>) => void;

export type ConsoleLogger = Record<ConsoleLoggerLevel, LogMethod> & {
	level: ConsoleLoggerLevel;
};

export function createConsoleLogger(level: ConsoleLoggerLevel): ConsoleLogger {
	const min = consoleLoggerLevels.indexOf(level);
	const noop = () => {};
	const log = (method: "debug" | "info" | "warn" | "error"): LogMethod =>
		(message, data) => {
			if (data) console[method](message, data);
			else console[method](message);
		};

	return {
		level,
		debug: min <= 0 ? log("debug") : noop,
		info: min <= 1 ? log("info") : noop,
		warning: min <= 2 ? log("warn") : noop,
		error: min <= 3 ? log("error") : noop,
	};
}
