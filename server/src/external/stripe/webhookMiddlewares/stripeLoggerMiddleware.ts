import { type AppEnv, AuthType } from "@autumn/shared";
import chalk from "chalk";
import type { Context, Next } from "hono";
import {
	addAppContextToLogs,
	addStripeEventToLogs,
} from "@/utils/logging/addContextToLogs";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext";

const logStripeWebhookRequest = ({ ctx }: { ctx: StripeWebhookContext }) => {
	const { logger, org, stripeEvent } = ctx;
	logger.info(
		`${chalk.yellow("STRIPE").padEnd(18)} ${stripeEvent.type.padEnd(30)} ${org.slug} | ${stripeEvent.id}`,
	);
};

const logStripeWebhookResponse = ({
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
		},
	);
};

export const stripeLoggerMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
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
			// @ts-expect-error
			object_id: `${stripeEvent.data?.object?.id}` || "N/A",
		},
	});

	logStripeWebhookRequest({ ctx });

	await next();

	logStripeWebhookResponse({ ctx, statusCode: c.res.status });
};
