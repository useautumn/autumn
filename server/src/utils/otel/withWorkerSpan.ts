import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { type TenantAttrs, withTenantContext } from "./tenantContext.js";

const tracer = trace.getTracer("autumn.worker");

/**
 * Root span wrapper for worker/cron jobs. Creates a span named after the
 * workflow, stamps workflow + tenant attrs on it AND on the OTel context so
 * every child span inherits them. Records exceptions and sets ERROR status on
 * throw. Always re-throws so SQS retry semantics are preserved.
 */
export const withWorkerSpan = async <T>({
	workflowName,
	workflowId,
	tenantAttrs,
	fn,
}: {
	workflowName: string;
	workflowId: string;
	tenantAttrs?: TenantAttrs;
	fn: () => Promise<T>;
}): Promise<T> => {
	return tracer.startActiveSpan(
		`worker.${workflowName}`,
		{ kind: SpanKind.CONSUMER },
		async (span) => {
			span.setAttributes({
				workflow_id: workflowId,
				workflow_name: workflowName,
			});

			if (tenantAttrs) {
				for (const [key, value] of Object.entries(tenantAttrs)) {
					if (value === undefined) continue;
					span.setAttribute(key, value);
				}
			}

			try {
				return await withTenantContext({
					attrs: tenantAttrs ?? {},
					fn,
				});
			} catch (err) {
				span.recordException(err as Error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: err instanceof Error ? err.message : String(err),
				});
				throw err;
			} finally {
				span.end();
			}
		},
	);
};
