import { type AppEnv, AuthType } from "@autumn/shared";
import chalk from "chalk";
import {
	addAppContextToLogs,
	addStripeEventToLogs,
} from "@/utils/logging/addContextToLogs";
import type { StripeWebhookContext } from "./stripeWebhookContext";

export const logStripeWebhookRequest = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { logger, org, stripeEvent } = ctx;
	logger.info(
		`${chalk.yellow("STRIPE").padEnd(18)} ${stripeEvent.type.padEnd(30)} ${org.slug} | ${stripeEvent.id}`,
	);
};

export const logStripeWebhookResponse = ({
	ctx,
	statusCode,
}: {
	ctx: StripeWebhookContext;
	statusCode: number;
}) => {
	const { logger, org, stripeEvent } = ctx;

	logger.info(
		`${chalk.yellow("STRIPE").padEnd(18)} ${stripeEvent.type.padEnd(30)} ${org.slug} | ${stripeEvent.id}`,
		{
			statusCode: statusCode,
			extras: ctx.extraLogs,
		},
	);
	if (Object.keys(ctx.extraLogs).length > 0) {
		logger.debug(`${stripeEvent.type} extra logs:`, ctx.extraLogs);
	}
};

export const enrichStripeWebhookLogger = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { stripeEvent, org, env, fullCustomer } = ctx;

	ctx.logger = addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			auth_type: AuthType.Stripe,
			org_id: org.id,
			org_slug: org.slug,
			env: env as AppEnv,
			customer_id: fullCustomer?.id || undefined,
			api_version: ctx.apiVersion?.semver,
		},
	});

	ctx.logger = addStripeEventToLogs({
		logger: ctx.logger,
		stripeEventContext: {
			type: stripeEvent.type,
			id: stripeEvent.id,
			object_id:
				`${(stripeEvent.data?.object as { id?: string })?.id}` || "N/A",
		},
	});
};
