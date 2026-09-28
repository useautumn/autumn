import { AppEnv, type Organization } from "@autumn/shared";

/** The org's Vercel Svix app for this env, if it has one. */
export const vercelSvixAppId = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): string | undefined => {
	const svix = org.processor_configs?.vercel?.svix;
	return (env === AppEnv.Live ? svix?.live_id : svix?.sandbox_id) || undefined;
};
