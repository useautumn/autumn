import { AppEnv, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createSvixApp } from "@/external/svix/svixHelpers.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const svixAppExists = async (appId: string | undefined): Promise<boolean> => {
	if (!appId) return false;
	try {
		await createSvixCli().application.get(appId);
		return true;
	} catch {
		return false;
	}
};

/**
 * Recreates the org's Svix apps when svix_config points at apps that no
 * longer exist in Svix (they are only ever created at org signup, so a
 * deleted app otherwise 404s webhook tests forever).
 */
export const ensureOrgSvixApps = async ({
	db,
	org,
}: {
	db: DrizzleCli;
	org: Organization;
}): Promise<void> => {
	if (!process.env.SVIX_API_KEY) return;

	const svixConfig = org.svix_config ?? {
		sandbox_app_id: "",
		live_app_id: "",
	};
	const [sandboxExists, liveExists] = await Promise.all([
		svixAppExists(svixConfig.sandbox_app_id),
		svixAppExists(svixConfig.live_app_id),
	]);
	if (sandboxExists && liveExists) return;

	const createApp = (env: AppEnv) =>
		createSvixApp({
			name: `${org.slug}_${env}`,
			orgId: org.id,
			env,
		});

	const [sandboxApp, liveApp] = await Promise.all([
		sandboxExists ? null : createApp(AppEnv.Sandbox),
		liveExists ? null : createApp(AppEnv.Live),
	]);

	const updatedSvixConfig = {
		sandbox_app_id: sandboxApp?.id ?? svixConfig.sandbox_app_id ?? "",
		live_app_id: liveApp?.id ?? svixConfig.live_app_id ?? "",
	};

	await OrgService.update({
		db,
		orgId: org.id,
		updates: { svix_config: updatedSvixConfig },
	});

	console.log(
		`✅ Repaired svix apps: sandbox=${updatedSvixConfig.sandbox_app_id}, live=${updatedSvixConfig.live_app_id}`,
	);
};
