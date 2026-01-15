import { AppEnv, AuthType, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type { Context, Next } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";

export const vercelSeederMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const { orgId, env } = c.req.param();
	const ctx = c.get("ctx");

	if (!ctx.org && orgId) {
		ctx.org = await OrgService.get({ db: ctx.db, orgId });
	}

	if (ctx.env !== env) {
		ctx.env = env as AppEnv;
	}

	if (!ctx.features && orgId) {
		ctx.features = await FeatureService.list({
			db: ctx.db,
			orgId,
			env: ctx.env ?? AppEnv.Sandbox,
		});
	}

	ctx.logger = addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: AuthType.Vercel,
			api_version: ctx.apiVersion?.semver,
		},
	});

	await next();
};

export const logVercelWebhook = ({
	logger,
	org,
	event,
}: {
	logger: Logger;
	org: Organization;
	event: any;
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
