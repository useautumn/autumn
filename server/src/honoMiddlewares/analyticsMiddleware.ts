import chalk from "chalk";
import type { Context, Next } from "hono";
import { getRedisUrlForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	addAppContextToLogs,
	addExtrasToLogs,
} from "@/utils/logging/addContextToLogs";
import { maskExtraLogs } from "@/utils/logging/maskExtraLogs.js";

/**
 * Logs response details asynchronously without blocking
 */
const logResponse = async ({
	ctx,
	c,
	skipUrls,
	durationMs,
}: {
	ctx: AutumnContext;
	c: Context<HonoEnv>;
	skipUrls: string[];
	durationMs: number;
}) => {
	try {
		// Skip logging for certain URLs
		if (skipUrls.includes(c.req.path)) {
			return;
		}

		ctx.logger = addExtrasToLogs({
			logger: ctx.logger,
			extras: ctx.extraLogs,
		});

		// Only clone and log response body for /v1 API routes (saves memory on webhooks, health checks, etc.)
		let responseBody: Record<string, unknown> | null = null;
		if (c.req.path.includes("/v1")) {
			const contentType = c.res.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					const clonedResponse = c.res.clone();
					responseBody = await clonedResponse.json();
				} catch (_error) {
					// Response might not be JSON or already consumed
				}
			}
		}

		// Log response in non-development environments
		// if (process.env.NODE_ENV !== "development") {
		const log = c.res.status === 200 ? ctx.logger.info : ctx.logger.warn;
		const statusColor = c.res.status === 200 ? chalk.green : chalk.yellow;

		log(
			`[${statusColor(c.res.status)}] ${c.req.path} (${ctx.org?.slug}) ${durationMs}ms`,
			{
				statusCode: c.res.status,
				durationMs,
				res: responseBody,
			},
		);

		if (
			Object.keys(ctx.extraLogs).length > 0 &&
			process.env.NODE_ENV === "development"
		) {
			const maskedLogs = maskExtraLogs(ctx.extraLogs);
			ctx.logger.debug(`EXTRA LOGS: ${JSON.stringify(maskedLogs, null, 2)}`);
		}
	} catch (error) {
		console.error("Failed to log response to logtail");
		console.error(error);
	}
};

/**
 * Analytics middleware for Hono
 * Enriches logger context and logs responses
 */
export const analyticsMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const skipUrls = ["/v1/customers/all/search"];

	const customerId = ctx.customerId;

	ctx.logger = addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: ctx.authType,
			customer_id: customerId,
			user_id: ctx.userId || undefined,
			user_email: ctx.user?.email || undefined,
			api_version: ctx.apiVersion?.semver,
			redis_url: ctx.org
				? getRedisUrlForCustomer({ org: ctx.org, customerId })
				: undefined,
		},
	});

	ctx.logger.info(
		`${c.req.method} ${c.req.path} (${ctx.org?.slug}) [${ctx.id}]`,
	);

	// Execute the request
	await next();

	// Re-fetch ctx after next() since handlers may have replaced it via c.set("ctx", {...})
	const finalCtx = c.get("ctx");
	const durationMs = Date.now() - finalCtx.timestamp;

	// Log response asynchronously without blocking (runs after response is sent)
	Promise.resolve()
		.then(() => logResponse({ ctx: finalCtx, c, skipUrls, durationMs }))
		.catch((error) => {
			console.error("Failed to log response to logtail");
			console.error(error);
		});
};
