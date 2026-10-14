import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addVercelCustomerToContext } from "./vercelLogContext.js";

export const VERCEL_INSTALLATION_CACHE_TTL_SECONDS = 24 * 60 * 60;

export const buildVercelInstallationCacheKey = ({
	orgId,
	env,
	vercelInstallationId,
}: {
	orgId: string;
	env: string;
	vercelInstallationId: string;
}) => {
	return `{${orgId}}:${env}:vercel_install:${vercelInstallationId}`;
};

export const vercelCustomerMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const { integrationConfigurationId } = c.req.param();

	c.set(
		"ctx",
		await addVercelCustomerToContext({
			ctx,
			vercelInstallationId: integrationConfigurationId,
		}),
	);

	await next();
};
