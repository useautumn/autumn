import type { AutumnLogger, LogArgs } from "../types.js";

const logToStdout = ({
	level,
	args,
}: {
	level: "debug" | "info" | "warn" | "error";
	args: LogArgs;
}) => {
	const method =
		level === "debug"
			? console.debug
			: level === "info"
				? console.info
				: level === "warn"
					? console.warn
					: console.error;
	method(...args);
};

export const mirrorLogger = ({
	logger,
}: {
	logger: AutumnLogger;
}): AutumnLogger => ({
	debug: (...args) => {
		logger.debug(...args);
		logToStdout({ level: "debug", args });
	},
	info: (...args) => {
		logger.info(...args);
		logToStdout({ level: "info", args });
	},
	warn: (...args) => {
		logger.warn(...args);
		logToStdout({ level: "warn", args });
	},
	warning: (...args) => {
		logger.warn(...args);
		logToStdout({ level: "warn", args });
	},
	error: (...args) => {
		logger.error(...args);
		logToStdout({ level: "error", args });
	},
	child: (params) => mirrorLogger({ logger: logger.child(params) }),
});

const prefixArgs = ({ prefix, args }: { prefix: string; args: LogArgs }) => {
	if (typeof args[0] !== "string") return [prefix, ...args];
	if (args[0].startsWith(prefix)) return args;
	return [`${prefix} ${args[0]}`, ...args.slice(1)];
};

export const withLogPrefix = ({
	logger,
	label,
}: {
	logger: AutumnLogger;
	label: string;
}): AutumnLogger => {
	const prefix = `[${label}]`;
	return {
		debug: (...args) => logger.debug(...prefixArgs({ prefix, args })),
		info: (...args) => logger.info(...prefixArgs({ prefix, args })),
		warn: (...args) => logger.warn(...prefixArgs({ prefix, args })),
		warning: (...args) => logger.warn(...prefixArgs({ prefix, args })),
		error: (...args) => logger.error(...prefixArgs({ prefix, args })),
		child: (params) => withLogPrefix({ logger: logger.child(params), label }),
	};
};
