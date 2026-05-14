import { Writable } from "node:stream";
import pino from "pino";
import { getAwsTaskIdentity } from "@/external/aws/ecs/awsTaskIdentity.js";

/**
 * Fields that don't render in the formatted dev/local console output
 * (they still go to JSON sinks). Trim noise like trigger metadata,
 * request envelopes, and high-cardinality structured data.
 */
const FORMATTED_LOG_EXCLUDE_FIELDS = new Set([
	// pino housekeeping
	"time",
	"level",
	"msg",
	"pid",
	"hostname",
	// request / response envelopes
	"req",
	"res",
	"statusCode",
	"body",
	"query",
	"durationMs",
	// app-context blocks (added via `addContextToLogs`)
	"context",
	"workflow",
	"trigger",
	"stripe_event",
	"worker",
	"extras",
	"type",
	// structured payloads
	"data",
	// AWS task identity (mixin)
	"aws",
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

/** Bun-friendly pino sink that prints `<ts> <LEVEL> <msg> <extras>`. */
const createDevLogStream = ({
	trailingNewline = true,
}: {
	trailingNewline?: boolean;
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

				process.stdout.write(formattedLog);
				callback();
			} catch (_error) {
				// Fallback for malformed JSON
				process.stdout.write(chunk);
				callback();
			}
		},
	});

/**
 * `mode: "dual"` is opt-in only — used by trigger.dev tasks so logs hit
 * both stdout (trigger run UI) and axiom (long-term store).
 *
 * In dev/test the stdout stream uses the formatted dev sink so trigger
 * pane lines look like server lines. In prod it stays raw JSON so
 * trigger.dev's cloud UI gets structured logs.
 *
 * `mode: "default"` preserves existing prod behavior verbatim.
 */
export type InitLoggerOptions = {
	mode?: "default" | "dual";
};

export const initLogger = (options: InitLoggerOptions = {}) => {
	const { mode = "default" } = options;

	const streams: pino.StreamEntry[] = [];
	const isDev = process.env.NODE_ENV === "development";
	const isTest = process.env.NODE_ENV === "test";
	const isDevOrTest = isDev || isTest;

	if (mode === "dual") {
		streams.push({
			level: isDevOrTest ? "debug" : "info",
			stream: isDevOrTest
				? createDevLogStream({ trailingNewline: false })
				: process.stdout,
		});
		if (process.env.AXIOM_TOKEN) {
			streams.push({
				level: "info",
				stream: pino.transport({
					target: "@axiomhq/pino",
					options: {
						dataset: "express",
						token: process.env.AXIOM_TOKEN,
					},
				}),
			});
		}
	} else {
		// DEFAULT FLOW — exact prior behavior. DO NOT MODIFY.
		if (isDev || isTest) {
			streams.push({
				level: "debug",
				stream: createDevLogStream(),
			});
		}

		if (process.env.AXIOM_TOKEN) {
			streams.push({
				level: "info",
				stream: pino.transport({
					target: "@axiomhq/pino",
					options: {
						dataset: "express",
						token: process.env.AXIOM_TOKEN,
					},
				}),
			});
		}

		if (streams.length === 0) {
			streams.push({
				level: "info",
				stream: createDevLogStream(),
			});
		}
	}

	const logger = pino(
		{
			level: isDev || isTest || mode === "dual" ? "debug" : "info",
			// Tag every log line with this process's AWS task identity so Axiom
			// can distinguish blue/green task sets. Returns {} until
			// `resolveAwsTaskIdentity` finishes (~100ms after boot) and on
			// non-AWS hosts (Railway, local) where identity stays null.
			mixin: () => {
				const identity = getAwsTaskIdentity();
				if (!identity) return {};
				if (!identity.serviceArn && !identity.imageSha) return {};
				return {
					aws: {
						serviceArn: identity.serviceArn,
						imageSha: identity.imageSha,
					},
				};
			},
			formatters: {
				level: (label: string) => {
					return {
						level: label.toUpperCase(),
					};
				},
			},
		},
		pino.multistream(streams),
	);

	return logger;
};
