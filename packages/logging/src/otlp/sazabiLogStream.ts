import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	LoggerProvider,
} from "@opentelemetry/sdk-logs";
import type pino from "pino";
import { resolveDeployment } from "../logger/resolveLoggerOptions.js";
import { isRoutineWarning } from "./isRoutineWarning.js";
import {
	SEVERITY_NUMBERS,
	sazabiIntakeUrlOf,
	sazabiLogLevelOf,
} from "./sazabiConfig.js";

const EXPORT_TIMEOUT_MS = 5000;
const FLUSH_TIMEOUT_MS = 2000;

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

/** Pino tap shipping warn+ lines, minus routine ones, to Sazabi over OTLP; undefined when Sazabi is off. */
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
			// Small batches keep each synchronous serialise short; the short timeout bounds a slow intake.
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({
					url: `${intakeUrl}/v1/logs`,
					timeoutMillis: EXPORT_TIMEOUT_MS,
				}),
				maxExportBatchSize: 128,
				scheduledDelayMillis: 1000,
				exportTimeoutMillis: EXPORT_TIMEOUT_MS,
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
						const record: PinoLogLine = JSON.parse(line);
						if (isRoutineWarning(record)) return;
						sazabiLogger.emit(pinoLineToOtlpLogRecord(record));
					} catch {
						// Sazabi is best effort: a bad line is dropped, never thrown into the caller.
					}
				},
			},
		},
		flush: () =>
			Promise.race([
				provider.forceFlush().catch(() => {}),
				new Promise<void>((resolve) => {
					setTimeout(resolve, FLUSH_TIMEOUT_MS).unref?.();
				}),
			]),
	};
};
