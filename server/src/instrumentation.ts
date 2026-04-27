import "dotenv/config";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { TenantAttrSpanProcessor } from "./utils/otel/TenantAttrSpanProcessor.js";

// Surface OTel internal warnings/errors (export failures, auth issues, etc.)
// but not DEBUG-level span dumps.
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

	// Passing `spanProcessors` replaces the default pipeline — NodeSDK does NOT
	// auto-add a BatchSpanProcessor for `traceExporter` when `spanProcessors`
	// is set. We must wire the exporter processor explicitly.
	// Dev: short 1s flush for fast feedback. Prod: default 5s for throughput.
	const isDev = process.env.NODE_ENV !== "production";
	const exportProcessor = new BatchSpanProcessor(traceExporter, {
		scheduledDelayMillis: isDev ? 1000 : 5000,
	});

	// No auto-instrumentations — Bun doesn't support require-in-the-middle.
	// Stripe, Drizzle, and Redis are instrumented via manual patchers in utils/otel/.
	sdk = new NodeSDK({
		spanProcessors: [new TenantAttrSpanProcessor(), exportProcessor],
	});

	sdk.start();

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
