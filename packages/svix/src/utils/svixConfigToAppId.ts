import { AppEnv } from "@autumn/shared";

/** The Svix app an org delivers through in an env, as its row stores them; null where it has none set up. */
export const svixConfigToAppId = ({
	svixConfig,
	env,
}: {
	svixConfig:
		| { sandbox_app_id?: string | null; live_app_id?: string | null }
		| null
		| undefined;
	env: AppEnv;
}): string | null => {
	const appId =
		env === AppEnv.Live ? svixConfig?.live_app_id : svixConfig?.sandbox_app_id;
	return appId || null;
};
