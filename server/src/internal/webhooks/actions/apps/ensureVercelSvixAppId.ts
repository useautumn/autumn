import { AppEnv, ErrCode, organizations, RecaseError } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { createSvixApp, deleteSvixApp } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { vercelSvixAppId } from "./vercelSvixAppId.js";

const unavailable = () =>
	new RecaseError({
		message: "Webhooks are unavailable right now. Try again shortly.",
		code: ErrCode.WebhooksUnavailable,
		statusCode: 503,
	});

/** The org's Vercel Svix app for this env, where `vercel.*` events are
 * published, created and stored like handleVercelConfig does when missing.
 * Only `processor_configs.vercel.svix.<env>_id` is written; a lost race keeps
 * the winner's app. */
export const ensureVercelSvixAppId = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string> => {
	const { db, org, env } = ctx;
	const existing = vercelSvixAppId({ org, env });
	if (existing) return existing;

	const app = await createSvixApp({
		name: `${org.slug}_${env}_vercel_sink`,
		orgId: org.id,
		env,
	});
	if (!app?.id) throw unavailable();

	const key = env === AppEnv.Live ? "live_id" : "sandbox_id";
	const configs = sql`COALESCE(${organizations.processor_configs}, '{}'::jsonb)`;
	const vercel = sql`COALESCE(${configs}->'vercel', '{}'::jsonb)`;
	const vercelSvix = sql`COALESCE(${vercel}->'svix', '{}'::jsonb)`;
	const claimed = await db
		.update(organizations)
		.set({
			processor_configs: sql`${configs} || jsonb_build_object('vercel', ${vercel} || jsonb_build_object('svix', ${vercelSvix} || jsonb_build_object(${key}::text, ${app.id}::text)))`,
		})
		.where(
			and(
				eq(organizations.id, org.id),
				sql`COALESCE(${organizations.processor_configs}->'vercel'->'svix'->>${key}, '') = ''`,
			),
		)
		.returning({ id: organizations.id });
	await clearOrgCache({ db, orgId: org.id });
	if (claimed.length > 0) return app.id;

	await deleteSvixApp({ appId: app.id });
	const winner = await OrgService.get({ db, orgId: org.id });
	const winnerAppId = winner && vercelSvixAppId({ org: winner, env });
	if (!winnerAppId) throw unavailable();
	return winnerAppId;
};
