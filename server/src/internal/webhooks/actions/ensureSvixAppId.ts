import { AppEnv, ErrCode, organizations, RecaseError } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { createSvixApp, deleteSvixApp } from "@/external/svix/svixHelpers.js";
import { getSvixAppId } from "@/external/svix/svixUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const appIdKey = ({ env }: { env: AppEnv }) =>
	env === AppEnv.Live ? "live_app_id" : "sandbox_app_id";

/** The org's Svix app for this env, created the way org provisioning does when
 * it was never made. A lost race keeps the winner's app and drops ours. */
export const ensureSvixAppId = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string> => {
	const { db, org, env } = ctx;
	const existing = getSvixAppId({ org, env });
	if (existing) return existing;

	const app = await createSvixApp({
		name: `${org.slug}_${env}`,
		orgId: org.id,
		env,
	});
	if (!app?.id) {
		throw new RecaseError({
			message: "Webhooks are unavailable right now. Try again shortly.",
			code: ErrCode.WebhooksUnavailable,
			statusCode: 503,
		});
	}

	const key = appIdKey({ env });
	const claimed = await db
		.update(organizations)
		.set({
			svix_config: sql`COALESCE(${organizations.svix_config}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${app.id}::text)`,
		})
		.where(
			and(
				eq(organizations.id, org.id),
				sql`COALESCE(${organizations.svix_config}->>${key}, '') = ''`,
			),
		)
		.returning({ id: organizations.id });
	await clearOrgCache({ db, orgId: org.id });
	if (claimed.length > 0) return app.id;

	await deleteSvixApp({ appId: app.id });
	const winner = await OrgService.get({ db, orgId: org.id });
	const winnerAppId = winner && getSvixAppId({ org: winner, env });
	if (!winnerAppId) {
		throw new RecaseError({
			message: "Webhooks are unavailable right now. Try again shortly.",
			code: ErrCode.WebhooksUnavailable,
			statusCode: 503,
		});
	}
	return winnerAppId;
};
