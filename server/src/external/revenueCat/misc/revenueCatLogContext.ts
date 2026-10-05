import { AuthType } from "@autumn/shared";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import {
	addAppContextToLogs,
	addRevenueCatEventToLogs,
} from "@/utils/logging/addContextToLogs";
import type { LogRevenueCatEventContext } from "@/utils/logging/loggerTypes";

export const buildRevenueCatEventContext = (
	event: Record<string, unknown> | undefined,
): LogRevenueCatEventContext => ({
	id: event?.id as string | undefined,
	type: event?.type as string | undefined,
	app_user_id: event?.app_user_id as string | undefined,
	original_app_user_id: event?.original_app_user_id as string | undefined,
	product_id: event?.product_id as string | undefined,
	transferred_from: event?.transferred_from as string[] | undefined,
	transferred_to: event?.transferred_to as string[] | undefined,
});

/** Rebuilds the RC webhook logger from its base so app and event context each appear once. */
export const setRevenueCatLogContext = ({
	ctx,
	customerId,
}: {
	ctx: RevenueCatWebhookContext;
	customerId?: string;
}) => {
	ctx.revenuecatBaseLogger ??= ctx.logger;
	const withApp = addAppContextToLogs({
		logger: ctx.revenuecatBaseLogger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: AuthType.Revenuecat,
			customer_id: customerId || undefined,
			api_version: ctx.apiVersion?.semver,
		},
	});
	ctx.logger = ctx.revenuecatEvent
		? addRevenueCatEventToLogs({
				logger: withApp,
				revenueCatEventContext: ctx.revenuecatEvent,
			})
		: withApp;
};
