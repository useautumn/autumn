import { resolveDeployment } from "@autumn/logging";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { logs, resources } from "@opentelemetry/sdk-node";
import type pino from "pino";
import { type PinoLogLine, parseMapleLog } from "./parseMapleLog.js";

const MAPLE_LOGS_URL = "https://ingest.maple.dev/v1/logs";

const SEVERITY_NUMBERS: Record<string, number> = {
	TRACE: 1,
	DEBUG: 5,
	INFO: 9,
	WARN: 13,
	ERROR: 17,
	FATAL: 21,
};

type Compression = NonNullable<
	ConstructorParameters<typeof OTLPLogExporter>[0]
>["compression"];

/** Nested objects become JSON strings so a large `extras` costs one stringify, not an attribute walk. */
export const toMapleLogRecord = (record: PinoLogLine) => {
	const { msg, level, time, ...attributes } = record;
	for (const key in attributes) {
		if (typeof attributes[key] === "object" && attributes[key] !== null) {
			attributes[key] = JSON.stringify(attributes[key]);
		}
	}
	return {
		body: msg,
		severityText: level,
		severityNumber: level === undefined ? undefined : SEVERITY_NUMBERS[level],
		timestamp: time,
		attributes: attributes as Record<string, string | number | boolean | null>,
	};
};

/** Pino tap that ships billing and Stripe webhook lines to Maple; empty without MAPLE_INGEST_KEY. */
export const createMapleLogStreams = (): pino.StreamEntry[] => {
	const ingestKey = process.env.MAPLE_INGEST_KEY;
	if (!ingestKey) return [];

	const provider = new logs.LoggerProvider({
		resource: resources.resourceFromAttributes({
			"service.name": "autumn-server",
			"service.namespace": "autumn",
			"deployment.environment": resolveDeployment(),
		}),
		processors: [
			new logs.BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({
					url: MAPLE_LOGS_URL,
					headers: { Authorization: `Bearer ${ingestKey}` },
					compression: "gzip" as Compression,
				}),
				scheduledDelayMillis: 5000,
			}),
		],
	});
	const mapleLogger = provider.getLogger("autumn-server");

	return [
		{
			level: "info",
			stream: {
				write: (line: string) => {
					try {
						const record = parseMapleLog(line);
						if (record) mapleLogger.emit(toMapleLogRecord(record));
					} catch {
						// Maple is best effort: a bad line is dropped, never thrown into the request.
					}
				},
			},
		},
	];
};
