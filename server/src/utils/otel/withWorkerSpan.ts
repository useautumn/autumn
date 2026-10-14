import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { getAwsTaskIdentity } from "@/external/aws/ecs/awsTaskIdentity.js";
import { type TenantAttrs, withTenantContext } from "./tenantContext.js";

const tracer = trace.getTracer("autumn.worker");

export const withWorkerSpan = async <T>({
	workflowName,
	workflowId,
	tenantAttrs,
	attributes,
	fn,
}: {
	workflowName: string;
	workflowId: string;
	tenantAttrs?: TenantAttrs;
	attributes?: Record<string, string | number>;
	fn: () => Promise<T>;
}): Promise<T> => {
	return tracer.startActiveSpan(
		`worker.${workflowName}`,
		{ kind: SpanKind.CONSUMER },
		async (span) => {
			span.setAttributes({
				...attributes,
				workflow_id: workflowId,
				workflow_name: workflowName,
			});

			const aws = getAwsTaskIdentity();
			if (aws?.serviceArn) {
				span.setAttribute("aws.service_arn", aws.serviceArn);
			}
			if (aws?.imageSha) {
				span.setAttribute("aws.image_sha", aws.imageSha);
			}

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
