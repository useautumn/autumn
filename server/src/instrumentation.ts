import "dotenv/config";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Initialize OTLP trace exporter with the endpoint URL and headers

if (process.env.AXIOM_TOKEN) {
	const traceExporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": "express_otel",
		},
	});

	// Creating a resource to identify your service in traces
	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: "express",
	});

	// Configuring the OpenTelemetry Node SDK
	const sdk = new NodeSDK({
		spanProcessor: new BatchSpanProcessor(traceExporter),
		resource: resource,
		instrumentations: [
			// Then add other auto-instrumentations
			getNodeAutoInstrumentations(),
		],
	});

	// Starting the OpenTelemetry SDK to begin collecting telemetry data
	console.log("Starting OpenTelemetry");
	sdk.start();
	console.log("OpenTelemetry started with IORedis instrumentation");
}
