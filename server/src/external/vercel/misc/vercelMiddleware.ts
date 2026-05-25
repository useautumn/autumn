import { AppEnv, AuthType, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type { Context, Next } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	addVercelCustomerToContext,
	buildVercelEventContext,
	enrichVercelAppLogger,
	enrichVercelEventLogger,
} from "./vercelLogContext.js";

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
		authType: AuthType.Vercel,
		rolloutSnapshot: computeRolloutSnapshot({
			orgId: org?.id,
			customerId: ctx.customerId,
		}),
	};

	const routedCtx = org
		? getCtxWithCustomerRedis({ ctx: nextCtx }).ctx
		: nextCtx;

	routedCtx.logger = enrichVercelAppLogger({ ctx: routedCtx });

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
	event: { type?: string; id?: string };
}) => {
	const eventType = event.type ?? "unknown";
	const eventId = event.id ?? "unknown";

	logger.info(
		`${chalk.magenta("VERCEL").padEnd(18)} ${eventType.padEnd(30)} ${org.slug} | ${eventId}`,
	);
};

export const vercelLogMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	let ctx = c.get("ctx");
	const body = await c.req.json();
	const vercelEventContext = buildVercelEventContext(body);

	if (vercelEventContext.installation_id) {
		try {
			ctx = await addVercelCustomerToContext({
				ctx,
				vercelInstallationId: vercelEventContext.installation_id,
			});
		} catch (error) {
			logCaughtError({
				logger: ctx.logger,
				message: "[vercel/webhook] Failed to enrich customer log context",
				error,
				data: { installationId: vercelEventContext.installation_id },
				level: "warn",
			});
		}
	}

	ctx.logger = enrichVercelEventLogger({ ctx, vercelEventContext });
	c.set("ctx", ctx);

	logVercelWebhook({ logger: ctx.logger, org: ctx.org, event: body });

	await next();
};
