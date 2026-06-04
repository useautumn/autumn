import { AuthType } from "@autumn/shared";
import type { AppEnv } from "@shared/models/genModels/genEnums";
import type { Organization } from "@shared/models/orgModels/orgTable";
import chalk from "chalk";
import type { Context, Next } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { RevenueCatWebhookHonoEnv } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { OrgService } from "@/internal/orgs/OrgService";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";
import { logRevenueCatWebhookMiddlewareError } from "./revenueCatWebhookLogging";

export const revenuecatIdentifyMiddleware = async (
	c: Context<RevenueCatWebhookHonoEnv>,
	next: Next,
) => {
	try {
		const ctx = c.get("ctx");
		ctx.authType = AuthType.Revenuecat;
	} catch (error) {
		logRevenueCatWebhookMiddlewareError({ c, stage: "identify", error });
		throw error;
	}

	await next();
};

export const revenuecatSeederMiddleware = async (
	c: Context<RevenueCatWebhookHonoEnv>,
	next: Next,
) => {
	const { orgId, env } = c.req.param();
	const ctx = c.get("ctx");
	ctx.authType = AuthType.Revenuecat;

	try {
		const result = await OrgService.getWithFeatures({
			db: ctx.db,
			orgId,
			env: env as AppEnv,
		});

		if (!result) {
			throw new Error("Organization with features not found");
		}

		const { org, features } = result;

		if (!ctx.org && orgId) {
			ctx.org = org;
		}
		if (ctx.env !== env) {
			ctx.env = env as AppEnv;
		}
		if (!ctx.features && orgId) {
			ctx.features = features;
		}

		ctx.logger = addAppContextToLogs({
			logger: ctx.logger,
			appContext: {
				org_id: ctx.org?.id,
				org_slug: ctx.org?.slug,
				env: ctx.env,
				auth_type: AuthType.Revenuecat,
				api_version: ctx.apiVersion?.semver,
			},
		});
	} catch (error) {
		logRevenueCatWebhookMiddlewareError({ c, stage: "seeder", error });
		throw error;
	}

	await next();
};

const logRevCatWebhook = ({
	logger,
	org,
	event,
}: {
	logger: Logger;
	org: Organization;
	event: { type: string; id: string };
}) => {
	logger.info(
		`${chalk.magentaBright("REVCAT").padEnd(18)} ${event.type.padEnd(30)} ${org.slug} | ${event.id ?? "no_event_id"}`,
	);
};

export const revenuecatLogMiddleware = async (
	c: Context<RevenueCatWebhookHonoEnv>,
	next: Next,
) => {
	try {
		const ctx = c.get("ctx");
		const { logger, org } = ctx;
		const body = await c.req.json();

		ctx.revenuecatEventType = body.event?.type;
		ctx.revenuecatEventId = body.event?.id;

		logRevCatWebhook({ logger, org, event: body.event });
	} catch (error) {
		logRevenueCatWebhookMiddlewareError({ c, stage: "log", error });
		throw error;
	}

	await next();
};
