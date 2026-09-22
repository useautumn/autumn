import type { AppEnv } from "@autumn/shared";
import type { Svix } from "svix";

export const createApp = async ({
	ctx,
	name,
	orgId,
	env,
	metadata = {},
}: {
	ctx: { svix: Svix };
	name: string;
	orgId: string;
	env: AppEnv;
	metadata?: Record<string, unknown>;
}): Promise<{ id: string }> => {
	const app = await ctx.svix.application.create({
		name,
		metadata: { org_id: orgId, env, ...metadata },
	});
	return { id: app.id };
};

export const deleteApp = async ({
	ctx,
	appId,
}: {
	ctx: { svix: Svix };
	appId: string;
}): Promise<void> => {
	await ctx.svix.application.delete(appId);
};

/** A link into Svix's own portal for the app, where an org manages its endpoints. */
export const appPortalUrl = async ({
	ctx,
	appId,
	featureFlags,
}: {
	ctx: { svix: Svix };
	appId: string;
	featureFlags?: string[];
}): Promise<string> => {
	const access = await ctx.svix.authentication.appPortalAccess(appId, {
		...(featureFlags ? { featureFlags } : {}),
	});
	return access.url;
};
