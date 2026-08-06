/** Per-integration span emission. Read at module load (instrumentation is
 * applied when the DB/Redis clients are constructed), so these must be env
 * vars — a runtime toggle is too late.
 *
 * High-volume batch work (migrations) emits a span per statement; inside a
 * Trigger task those export synchronously unless
 * TRIGGER_OTEL_BATCH_PROCESSING_ENABLED=1, so disabling them is the reliable
 * way to keep tracing off the critical path. */
const enabled = (envVar: string) => process.env[envVar] !== "0";

export const otelConfig = {
	redis: enabled("OTEL_REDIS"),
	stripe: enabled("OTEL_STRIPE"),
	drizzle: enabled("OTEL_DRIZZLE"),
};
