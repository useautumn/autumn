import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	LoggerProvider,
} from "@opentelemetry/sdk-logs";
import type pino from "pino";
import { resolveDeployment } from "../logger/resolveLoggerOptions.js";
import {
	SEVERITY_NUMBERS,
	sazabiIntakeUrlOf,
	sazabiLogLevelOf,
} from "./sazabiConfig.js";

type PinoLogLine = {
	msg?: string;
	level?: string;
	time?: number;
	[key: string]: unknown;
};

/** Nested objects become JSON strings: OTLP attributes are flat, and one stringify beats an attribute walk. */
export const pinoLineToOtlpLogRecord = (record: PinoLogLine) => {
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

export type SazabiLogStream = {
	entry: pino.StreamEntry;
	flush: () => Promise<void>;
};

/** Pino tap shipping warn+ lines (SAZABI_LOG_LEVEL overrides) to Sazabi over OTLP; undefined when Sazabi is off. */
export const createSazabiLogStream = ({
	service,
	env = process.env,
}: {
	service: string;
	env?: NodeJS.ProcessEnv;
}): SazabiLogStream | undefined => {
	const intakeUrl = sazabiIntakeUrlOf({ env });
	if (!intakeUrl) return undefined;

	const provider = new LoggerProvider({
		resource: resourceFromAttributes({
			"service.name": service,
			"service.namespace": "autumn",
			"deployment.environment": resolveDeployment(env),
		}),
		processors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({ url: `${intakeUrl}/v1/logs` }),
				scheduledDelayMillis: 5000,
			}),
		],
	});
	const sazabiLogger = provider.getLogger(service);

	return {
		entry: {
			level: sazabiLogLevelOf({ env }),
			stream: {
				write: (line: string) => {
					try {
						sazabiLogger.emit(pinoLineToOtlpLogRecord(JSON.parse(line)));
					} catch {
						// Sazabi is best effort: a bad line is dropped, never thrown into the caller.
					}
				},
			},
		},
		flush: () => provider.forceFlush(),
	};
};
