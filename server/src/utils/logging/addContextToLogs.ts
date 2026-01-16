import type { Logger } from "@/external/logtail/logtailUtils.js";
import type {
	LogAppContext,
	LogRequestContext,
	LogStripeEventContext,
	LogWorkflowContext,
} from "./loggerTypes.js";

export const addRequestToLogs = ({
	logger,
	requestContext,
}: {
	logger: Logger;
	requestContext: LogRequestContext;
}): Logger => {
	return logger.child({ context: { req: requestContext } });
};

export const addAppContextToLogs = ({
	logger,
	appContext,
}: {
	logger: Logger;
	appContext: LogAppContext;
}): Logger => {
	return logger.child({ context: { context: appContext } });
};

export const addStripeEventToLogs = ({
	logger,
	stripeEventContext,
}: {
	logger: Logger;
	stripeEventContext: LogStripeEventContext;
}): Logger => {
	return logger.child({ context: { stripe_event: stripeEventContext } });
};

export const addWorkflowToLogs = ({
	logger,
	workflowContext,
}: {
	logger: Logger;
	workflowContext: LogWorkflowContext;
}): Logger => {
	return logger.child({ context: { workflow: workflowContext } });
};

export const addExtrasToLogs = ({
	logger,
	extras,
}: {
	logger: Logger;
	extras: Record<string, unknown>;
}): Logger => {
	return logger.child({ context: { extras } });
};

/**
 * Map fields:
 * req.body, req.query, extras, workflow.payload, worker.payload, data, data2, res
 */
