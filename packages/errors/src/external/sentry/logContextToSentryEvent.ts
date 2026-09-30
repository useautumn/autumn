import type { ErrorClassification } from "../../models/errorClassification.js";
import type { LogContext } from "../../models/logContext.js";

/** Tags are what alerts filter on and Slack shows; the org is the Sentry user so issues count orgs affected. */
export const logContextToSentryEvent = ({
	service,
	logContext,
	classification,
}: {
	service: string;
	logContext: LogContext;
	classification: ErrorClassification;
}) => {
	const { context, req, workflow } = logContext;
	const orgId = context?.org_id;
	const orgSlug = context?.org_slug;

	return {
		tags: {
			error_kind: classification.kind,
			error_code: classification.code,
			service,
			operation: workflow?.name ?? req?.name,
			env: context?.env,
			org_id: orgId,
			org_slug: orgSlug,
		},
		user: orgId ? { id: orgId, username: orgSlug } : undefined,
		contexts: {
			autumn: {
				org_id: orgId,
				customer_id: context?.customer_id,
				entity_id: context?.entity_id,
				request_id: req?.id ?? workflow?.id,
			},
		},
	};
};
