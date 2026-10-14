import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	LoggerProvider,
} from "@opentelemetry/sdk-logs";
import type pino from "pino";
import { LOG_FLUSH_TIMEOUT_MS, SAZABI_EXPORT } from "../config.js";
import { resolveDeployment } from "../logger/resolveLoggerOptions.js";
import type { LoggerLevel } from "../types.js";
import { isRoutineWarning } from "./isRoutineWarning.js";

const SEVERITY_NUMBERS: Record<string, number> = {
	TRACE: 1,
	DEBUG: 5,
	INFO: 9,
	WARN: 13,
	ERROR: 17,
	FATAL: 21,
};

export const sazabiIntakeUrlOf = ({
	env,
}: {
	env: NodeJS.ProcessEnv;
}): string | undefined => {
	const intakeUrl = env.SAZABI_INTAKE_URL?.replace(/\/+$/, "");
	if (!intakeUrl || !URL.canParse(intakeUrl)) return undefined;
	const isDevOrTest = env.NODE_ENV === "development" || env.NODE_ENV === "test";
	if (isDevOrTest && env.SAZABI_DEV_LOGS !== "1") return undefined;
	return intakeUrl;
};

type PinoLogLine = {
	msg?: string;
	level?: string;
	time?: number;
	[key: string]: unknown;
};

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
				exporter: new OTLPLogExporter({
					url: `${intakeUrl}/v1/logs`,
					timeoutMillis: SAZABI_EXPORT.timeoutMs,
				}),
				maxExportBatchSize: SAZABI_EXPORT.maxBatchSize,
				scheduledDelayMillis: SAZABI_EXPORT.intervalMs,
				exportTimeoutMillis: SAZABI_EXPORT.timeoutMs,
			}),
		],
	});
	const sazabiLogger = provider.getLogger(service);

	return {
		entry: {
			level: (env.SAZABI_LOG_LEVEL as LoggerLevel | undefined) ?? "warn",
			stream: {
				write: (line: string) => {
					try {
						const record: PinoLogLine = JSON.parse(line);
						if (isRoutineWarning(record)) return;
						sazabiLogger.emit(pinoLineToOtlpLogRecord(record));
					} catch {}
				},
			},
		},
		flush: () =>
			Promise.race([
				provider.forceFlush().catch(() => {}),
				new Promise<void>((resolve) => {
					setTimeout(resolve, LOG_FLUSH_TIMEOUT_MS).unref?.();
				}),
			]),
	};
};
