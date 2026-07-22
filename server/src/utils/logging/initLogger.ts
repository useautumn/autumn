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
	"vercel_event",
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

/** Bun-friendly pino sink that prints `<ts> <LEVEL> <msg> <extras>`.
 *
 *  `useConsoleLog` routes the formatted line through `console.log` instead
 *  of `process.stdout.write`. Trigger.dev's run UI instruments `console.*`
 *  but not raw stdout, so dual-mode loggers (used inside trigger tasks)
 *  flip this on to make their lines render inline in the timeline. Visually
 *  identical in `bun d` since console.log just appends a newline. */
const createDevLogStream = ({
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

				if (useConsoleLog) {
					console.log(formattedLog);
				} else {
					process.stdout.write(formattedLog);
				}
				callback();
			} catch (_error) {
				// Fallback for malformed JSON
				if (useConsoleLog) {
					console.log(chunk.toString());
				} else {
					process.stdout.write(chunk);
				}
				callback();
			}
		},
	});

/** Raw JSON sink routed through `console.log` so trigger.dev's run UI
 *  (which only instruments console.*) picks up dual-mode prod lines. */
const createConsoleJsonStream = () =>
	new Writable({
		write(chunk, _encoding, callback) {
			console.log(chunk.toString().trimEnd());
			callback();
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
	transport?: "direct" | "firelens";
};

export const initLogger = (options: InitLoggerOptions = {}) => {
	const { mode = "default", transport } = options;

	const streams: pino.StreamEntry[] = [];
	const isDev = process.env.NODE_ENV === "development";
	const isTest = process.env.NODE_ENV === "test";
	const isDevOrTest = isDev || isTest;
	const configuredTransport =
		transport ??
		(process.env.AXIOM_LOG_TRANSPORT === "firelens" ? "firelens" : "direct");
	const isRunningInEcs = Boolean(process.env.ECS_CONTAINER_METADATA_URI_V4);
	const shouldUseFirelens =
		configuredTransport === "firelens" && !isDevOrTest && isRunningInEcs;

	if (mode === "dual") {
		streams.push({
			level: isDevOrTest ? "debug" : "info",
			stream: isDevOrTest
				? createDevLogStream({
						trailingNewline: false,
						useConsoleLog: true,
					})
				: shouldUseFirelens
					? process.stdout
					: createConsoleJsonStream(),
		});
		if (!shouldUseFirelens && process.env.AXIOM_TOKEN) {
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

		if (shouldUseFirelens) {
			streams.push({
				level: "info",
				stream: process.stdout,
			});
		} else if (process.env.AXIOM_TOKEN) {
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
