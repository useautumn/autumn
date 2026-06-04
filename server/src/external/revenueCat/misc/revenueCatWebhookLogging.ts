import type { Context } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { RevenueCatWebhookHonoEnv } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";

type RevenueCatErrorStage =
	| "identify"
	| "seeder"
	| "log"
	| "refresh"
	| "handler";

type ErrorLike = Error & {
	code?: string;
	statusCode?: number;
	status?: number;
};

const serializeError = (error: unknown) => {
	if (error instanceof Error) {
		const errorLike = error as ErrorLike;
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			code: errorLike.code,
			statusCode: errorLike.statusCode ?? errorLike.status,
		};
	}

	return {
		name: typeof error,
		message: String(error),
	};
};

const getLogger = ({
	c,
	fallbackLogger,
}: {
	c: Context<RevenueCatWebhookHonoEnv>;
	fallbackLogger?: Logger;
}) => {
	try {
		return c.get("ctx")?.logger ?? fallbackLogger;
	} catch {
		return fallbackLogger;
	}
};

export const getRevenueCatWebhookDiagnosticFields = ({
	c,
	stage,
}: {
	c: Context<RevenueCatWebhookHonoEnv>;
	stage: RevenueCatErrorStage;
}) => {
	const { orgId, env } = c.req.param();
	const ctx = c.get("ctx");

	return {
		revenuecat_webhook: {
			stage,
			orgId,
			env,
			resolvedOrgId: ctx?.org?.id,
			resolvedOrgSlug: ctx?.org?.slug,
			eventType: ctx?.revenuecatEventType,
			eventId: ctx?.revenuecatEventId,
		},
	};
};

export const logRevenueCatWebhookMiddlewareError = ({
	c,
	stage,
	error,
	fallbackLogger,
}: {
	c: Context<RevenueCatWebhookHonoEnv>;
	stage: RevenueCatErrorStage;
	error: unknown;
	fallbackLogger?: Logger;
}) => {
	const logger = getLogger({ c, fallbackLogger });
	if (!logger) return;

	logger.error("RevenueCat webhook middleware error", {
		...getRevenueCatWebhookDiagnosticFields({ c, stage }),
		error: serializeError(error),
	});
};
