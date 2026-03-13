import "dotenv/config";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

// Surface OTel internal warnings/errors so export failures are visible
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

let sdk: NodeSDK | null = null;

if (process.env.AXIOM_TOKEN) {
	// NodeSDK reads OTEL_SERVICE_NAME to set the service resource attribute
	process.env.OTEL_SERVICE_NAME = "autumn-server";

	const traceExporter = new OTLPTraceExporter({
		url: "https://api.axiom.co/v1/traces",
		headers: {
			Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
			"X-Axiom-Dataset": "otel",
		},
	});

	// No auto-instrumentations — Bun doesn't support require-in-the-middle.
	// Stripe, Drizzle, and Redis are instrumented via manual patchers in utils/otel/.
	sdk = new NodeSDK({
		traceExporter,
	});

	console.log("Starting OpenTelemetry");
	sdk.start();
}

export { sdk as otelSdk };
