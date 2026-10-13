import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type {
	LogRecordExporter,
	ReadableLogRecord,
} from "@opentelemetry/sdk-logs";
import {
	SEVERITY_NUMBERS,
	sazabiIntakeUrlOf,
	sazabiLogLevelOf,
} from "./sazabiConfig.js";

const EXPORT_SUCCESS = 0;

/** Drops records below `minSeverity` so Trigger's info-level run chatter never reaches Sazabi. */
const filterBySeverity = ({
	exporter,
	minSeverity,
}: {
	exporter: LogRecordExporter;
	minSeverity: number;
}): LogRecordExporter => ({
	export: (records: ReadableLogRecord[], resultCallback) => {
		const kept = records.filter(
			(record) => (record.severityNumber ?? 0) >= minSeverity,
		);
		if (kept.length === 0) return resultCallback({ code: EXPORT_SUCCESS });
		exporter.export(kept, resultCallback);
	},
	shutdown: () => exporter.shutdown(),
	forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
});

/** Trigger.dev `telemetry.logExporters` entry for Sazabi; empty when Sazabi is off. */
export const createSazabiTriggerLogExporters = ({
	env = process.env,
}: {
	env?: NodeJS.ProcessEnv;
} = {}): LogRecordExporter[] => {
	const intakeUrl = sazabiIntakeUrlOf({ env });
	if (!intakeUrl) return [];

	return [
		filterBySeverity({
			exporter: new OTLPLogExporter({ url: `${intakeUrl}/v1/logs` }),
			minSeverity:
				SEVERITY_NUMBERS[sazabiLogLevelOf({ env }).toUpperCase()] ??
				SEVERITY_NUMBERS.WARN,
		}),
	];
};
