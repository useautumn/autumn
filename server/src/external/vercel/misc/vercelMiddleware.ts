import { AppEnv, AuthType, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type { Context, Next } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";

export const vercelSeederMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const { orgId, env: routeEnv } = c.req.param();
	const ctx = c.get("ctx");

	const org =
		!ctx.org && orgId ? await OrgService.get({ db: ctx.db, orgId }) : ctx.org;

	if (org?.config) {
		org.config.automatic_tax = false;
	}
	const env = ctx.env !== routeEnv ? (routeEnv as AppEnv) : ctx.env;

	const features =
		!ctx.features && orgId
			? await FeatureService.list({
					db: ctx.db,
					orgId,
					env: env ?? AppEnv.Sandbox,
				})
			: ctx.features;

	const nextCtx = {
		...ctx,
		org,
		env,
		features,
		rolloutSnapshot: computeRolloutSnapshot({
			orgId: org?.id,
			customerId: ctx.customerId,
		}),
	};

	const routedCtx = org
		? getCtxWithCustomerRedis({ ctx: nextCtx }).ctx
		: nextCtx;

	routedCtx.logger = addAppContextToLogs({
		logger: routedCtx.logger,
		appContext: {
			org_id: routedCtx.org?.id,
			org_slug: routedCtx.org?.slug,
			env: routedCtx.env,
			auth_type: AuthType.Vercel,
			api_version: routedCtx.apiVersion?.semver,
		},
	});

	c.set("ctx", routedCtx);

	await next();
};

export const logVercelWebhook = ({
	logger,
	org,
	event,
}: {
	logger: Logger;
	org: Organization;
	event: { type: string; id: string };
}) => {
	logger.info(
		`${chalk.magenta("VERCEL").padEnd(18)} ${event.type.padEnd(30)} ${org.slug} | ${event.id}`,
	);
};

export const vercelLogMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const { logger, org } = c.get("ctx");
	const body = await c.req.json();

	logVercelWebhook({ logger, org, event: body });

	await next();
};
