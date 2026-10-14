import "dotenv/config";
import {
	DiagConsoleLogger,
	DiagLogLevel,
	diag,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK, resources } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resolveAwsTaskIdentity } from "./external/aws/ecs/awsTaskIdentity.js";
import { FilteringSpanProcessor } from "./utils/otel/FilteringSpanProcessor.js";
import {
	buildCompactOtelResourceAttributes,
	buildOtelResourceDefinitionAttributes,
	createOtelServiceInstanceId,
} from "./utils/otel/otelResourceDefinition.js";
import { TenantAttrSpanProcessor } from "./utils/otel/TenantAttrSpanProcessor.js";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

let sdk: NodeSDK | null = null;

if (process.env.AXIOM_TOKEN) {
	const serviceInstanceId = createOtelServiceInstanceId();
	const resource = resources.resourceFromAttributes(
		buildCompactOtelResourceAttributes({ serviceInstanceId }),
	);

	const traceExporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": "otel",
		},
	});

	const isDev = process.env.NODE_ENV !== "production";
	const exportProcessor = new BatchSpanProcessor(traceExporter, {
		scheduledDelayMillis: isDev ? 1000 : 5000,
	});
	const filteredExportProcessor = new FilteringSpanProcessor(exportProcessor);
	const metricReader = process.env.AXIOM_METRICS_DATASET
		? new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({
					url: "https://api.axiom.co/v1/metrics",
					headers: {
						Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
						"x-axiom-metrics-dataset": process.env.AXIOM_METRICS_DATASET,
					},
				}),
				exportIntervalMillis: 60_000,
			})
		: undefined;

	// No auto-instrumentations — Bun doesn't support require-in-the-middle.
	sdk = new NodeSDK({
		autoDetectResources: false,
		resource,
		spanProcessors: [new TenantAttrSpanProcessor(), filteredExportProcessor],
		metricReaders: metricReader ? [metricReader] : [],
	});

	sdk.start();

	void resolveAwsTaskIdentity().then((awsIdentity) => {
		const defaultResourceAttributes = resources.defaultResource().attributes;
		const resourceDefinitionSpan = trace
			.getTracer("autumn.resource")
			.startSpan("otel.resource_definition");
		resourceDefinitionSpan.setAttributes(
			buildOtelResourceDefinitionAttributes({
				serviceInstanceId,
				awsIdentity,
				telemetrySdk: {
					language: String(defaultResourceAttributes["telemetry.sdk.language"]),
					name: String(defaultResourceAttributes["telemetry.sdk.name"]),
					version: String(defaultResourceAttributes["telemetry.sdk.version"]),
				},
			}),
		);
		resourceDefinitionSpan.setStatus({ code: SpanStatusCode.OK });
		resourceDefinitionSpan.end();
	});

	const shutdown = async () => {
		try {
			await sdk?.shutdown();
		} catch (err) {
			console.error("[otel] shutdown error", err);
		}
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}

export { sdk as otelSdk };
