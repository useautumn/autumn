import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addVercelCustomerToContext } from "./vercelLogContext.js";

/** TTL for vercel installation ID -> customer ID cache (1 day) */
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

/**
 * Fetches the Autumn customer by Vercel installation ID and sets `ctx.fullCustomer`.
 * Tolerant of null — customer may not exist yet (e.g. during `PUT` upsert).
 */
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
