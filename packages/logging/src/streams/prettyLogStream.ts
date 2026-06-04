import { Writable } from "node:stream";

const FORMATTED_LOG_EXCLUDE_FIELDS = new Set([
	"time",
	"level",
	"msg",
	"pid",
	"hostname",
	"req",
	"res",
	"statusCode",
	"body",
	"query",
	"durationMs",
	"duration_ms",
	"context",
	"workflow",
	"trigger",
	"stripe_event",
	"vercel_event",
	"worker",
	"extras",
	"type",
	"data",
	"aws",
	"service",
]);

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
	bgRed: "\x1b[41m",
};

const levelColors: Record<number | string, string> = {
	10: colors.gray,
	20: colors.blue,
	30: colors.green,
	40: colors.yellow,
	50: colors.red,
	60: colors.bgRed,
	TRACE: colors.gray,
	DEBUG: colors.blue,
	INFO: colors.green,
	WARN: colors.yellow,
	ERROR: colors.red,
	FATAL: colors.bgRed,
};

const levelNames: Record<number | string, string> = {
	10: "TRACE",
	20: "DEBUG",
	30: "INFO",
	40: "WARN",
	50: "ERROR",
	60: "FATAL",
	TRACE: "TRACE",
	DEBUG: "DEBUG",
	INFO: "INFO",
	WARN: "WARN",
	ERROR: "ERROR",
	FATAL: "FATAL",
};

export const createPrettyLogStream = ({
	trailingNewline = true,
	useConsoleLog = false,
}: {
	trailingNewline?: boolean;
	useConsoleLog?: boolean;
} = {}) =>
	new Writable({
		write(chunk, _encoding, callback) {
			try {
				const log = JSON.parse(chunk.toString());
				const timestamp = new Date(log.time)
					.toISOString()
					.replace("T", " ")
					.replace("Z", "");
				const level = log.level;
				const levelColor = levelColors[level] || colors.white;
				const levelName =
					levelNames[level] || (typeof level === "string" ? level : "UNKNOWN");
				let message = log.msg || "";

				const additionalFields = Object.keys(log)
					.filter((key) => !FORMATTED_LOG_EXCLUDE_FIELDS.has(key))
					.reduce(
						(acc, key) => {
							acc[key] = log[key];
							return acc;
						},
						{} as Record<string, unknown>,
					);

				if (Object.keys(additionalFields).length > 0) {
					message += ` ${JSON.stringify(additionalFields, null, 2)}`;
				}

				const formattedLog = `${colors.gray}${timestamp}${colors.reset} ${levelColor}${colors.bright}${levelName}${colors.reset} ${message}${trailingNewline ? "\n" : ""}`;
				if (useConsoleLog) console.log(formattedLog);
				else process.stdout.write(formattedLog);
				callback();
			} catch {
				if (useConsoleLog) console.log(chunk.toString());
				else process.stdout.write(chunk);
				callback();
			}
		},
	});
