import "dotenv/config";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Minimal OpenTelemetry configuration optimized for low memory footprint.
 * Auto-instrumentations disabled to reduce overhead - only manual spans are traced.
 */

if (process.env.AXIOM_TOKEN) {
	const traceExporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": "express_otel",
		},
	});

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: "express",
	});

	const sdk = new NodeSDK({
		spanProcessor: new BatchSpanProcessor(traceExporter, {
			maxQueueSize: 512, // Aggressive limit - drop spans early to save memory
			maxExportBatchSize: 128, // Smaller batches = less memory per batch
			scheduledDelayMillis: 2000, // Flush more frequently to reduce buildup
			exportTimeoutMillis: 10000, // Fail fast if Axiom is slow
		}),
		resource: resource,
		// No auto-instrumentations - drastically reduces memory and CPU overhead
		instrumentations: [],
	});

	console.log("Starting OpenTelemetry (minimal mode)");
	sdk.start();
}
