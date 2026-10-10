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
import {
	BatchSpanProcessor,
	type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resolveAwsTaskIdentity } from "./external/aws/ecs/awsTaskIdentity.js";
import { FanoutSpanProcessor } from "./utils/otel/FanoutSpanProcessor.js";
import { FilteringSpanProcessor } from "./utils/otel/FilteringSpanProcessor.js";
import { MapleScopedSpanProcessor } from "./utils/otel/MapleScopedSpanProcessor.js";
import {
	buildCompactOtelResourceAttributes,
	buildOtelResourceDefinitionAttributes,
	createOtelServiceInstanceId,
} from "./utils/otel/otelResourceDefinition.js";
import { TenantAttrSpanProcessor } from "./utils/otel/TenantAttrSpanProcessor.js";

// Surface OTel internal warnings/errors (export failures, auth issues, etc.)
// but not DEBUG-level span dumps.
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

let sdk: NodeSDK | null = null;

const MAPLE_TRACES_URL = `${process.env.MAPLE_OTLP_ENDPOINT ?? "https://ingest.maple.dev"}/v1/traces`;

type Compression = NonNullable<
	ConstructorParameters<typeof OTLPTraceExporter>[0]
>["compression"];

if (process.env.AXIOM_TOKEN || process.env.MAPLE_INGEST_KEY) {
	const serviceInstanceId = createOtelServiceInstanceId();
	const resource = resources.resourceFromAttributes(
		buildCompactOtelResourceAttributes({ serviceInstanceId }),
	);

	// Passing `spanProcessors` replaces the default pipeline — NodeSDK does NOT
	// auto-add a BatchSpanProcessor for `traceExporter` when `spanProcessors`
	// is set. We must wire the exporter processor explicitly.
	// Dev: short 1s flush for fast feedback. Prod: default 5s for throughput.
	const isDev = process.env.NODE_ENV !== "production";
	const scheduledDelayMillis = isDev ? 1000 : 5000;
	const exportProcessors: SpanProcessor[] = [];

	if (process.env.AXIOM_TOKEN) {
		const traceExporter = new OTLPTraceExporter({
			url: "https://api.axiom.co/v1/traces",
			headers: {
				Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
				"X-Axiom-Dataset": "otel",
			},
		});
		exportProcessors.push(
			new BatchSpanProcessor(traceExporter, { scheduledDelayMillis }),
		);
	}

	// Maple gets the same scope as the log tap (billing requests + Stripe
	// webhooks), so every trace id on a Maple log line resolves to its trace.
	if (process.env.MAPLE_INGEST_KEY) {
		const mapleExporter = new OTLPTraceExporter({
			url: MAPLE_TRACES_URL,
			headers: { Authorization: `Bearer ${process.env.MAPLE_INGEST_KEY}` },
			compression: "gzip" as Compression,
		});
		exportProcessors.push(
			new MapleScopedSpanProcessor(
				new BatchSpanProcessor(mapleExporter, { scheduledDelayMillis }),
			),
		);
	}

	const filteredExportProcessor = new FilteringSpanProcessor(
		new FanoutSpanProcessor(exportProcessors),
	);
	const metricReader =
		process.env.AXIOM_TOKEN && process.env.AXIOM_METRICS_DATASET
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
	// Stripe, Drizzle, and Redis are instrumented via manual patchers in utils/otel/.
	sdk = new NodeSDK({
		autoDetectResources: false,
		resource,
		spanProcessors: [new TenantAttrSpanProcessor(), filteredExportProcessor],
		// Omitting this makes NodeSDK fall back to OTEL_METRICS_EXPORTER, which
		// defaults to OTLP on localhost:4318 and floods logs with ECONNREFUSED.
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

	// Flush spans on SIGTERM/SIGINT so dev restarts (nodemon) and prod rollouts
	// don't swallow in-flight batches.
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
