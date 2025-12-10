import { AppEnv } from "@shared/models/genModels/genEnums";
import type { Organization } from "@shared/models/orgModels/orgTable";
import chalk from "chalk";
import type { Context, Next } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { FeatureService } from "@/internal/features/FeatureService";
import { OrgService } from "@/internal/orgs/OrgService";

export const revcatSeederMiddleware = async (
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

	await next();
};

export const logRevCatWebhook = ({
	logger,
	org,
	event,
}: {
	logger: Logger;
	org: Organization;
	event: { type: string; id: string };
}) => {
	logger.info(
		`${chalk.magentaBright("REVCAT").padEnd(18)} ${event.type.padEnd(30)} ${org.slug} | ${event.id}`,
	);
};

export const revcatLogMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const { logger, org } = c.get("ctx");
	const body = await c.req.json();

	logRevCatWebhook({ logger, org, event: body.event });

	await next();
};
