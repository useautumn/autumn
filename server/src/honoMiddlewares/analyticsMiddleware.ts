import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addAppContextToLogs } from "@/utils/logging/addContextToLogs";
import { logRequestResult } from "./requestLogging/logRequestResult.js";

export const parseCustomerIdFromUrl = ({
	url,
}: {
	url: string;
}): string | undefined => {
	if (!url.startsWith("/v1")) {
		return undefined;
	}

	const cleanUrl = url.split("?")[0].replace(/^\/+|\/+$/g, "");
	const segments = cleanUrl.split("/");
	const customersIndex = segments.indexOf("customers");

	if (customersIndex !== -1 && segments[customersIndex + 1]) {
		return segments[customersIndex + 1];
	}

	return undefined;
};

const extractCustomerIdFromBody = ({
	body,
	path,
	method,
}: {
	body: Record<string, unknown>;
	path: string;
	method: string;
}): string | undefined => {
	const isCreateCustomerPath =
		path.startsWith("/v1/customers") &&
		method === "POST" &&
		!path.includes("customers.get_or_create") &&
		!path.includes("customers.");
	return (isCreateCustomerPath ? body?.id : body?.customer_id) as
		| string
		| undefined;
};

export const parseCustomerIdFromBody = async (
	c: Context<HonoEnv>,
): Promise<
	{ customerId: string | undefined; sendEvent: boolean | undefined } | undefined
> => {
	const method = c.req.method;
	if (method === "POST" || method === "PUT" || method === "PATCH") {
		try {
			const body = await c.req.json();

			return {
				customerId: extractCustomerIdFromBody({
					body,
					path: c.req.path,
					method,
				}),
				sendEvent: body?.send_event,
			};
		} catch (_error) {
			// Body might not be JSON, that's okay
			return undefined;
		}
	}

	return undefined;
};

/**
 * Analytics middleware for Hono
 * Enriches logger context and logs responses
 */
export const analyticsMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const skipUrls = ["/v1/customers/all/search"];

	const customerId = ctx.customerId;
	const entityId = ctx.entityId;

	ctx.logger = addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: ctx.authType,
			customer_id: customerId,
			entity_id: entityId,
			user_id: ctx.userId || undefined,
			user_email: ctx.user?.email || undefined,
			api_version: ctx.apiVersion?.semver,
		},
	});

	ctx.logger.info(
		`${c.req.method} ${c.req.path} (${ctx.org?.slug}) [${ctx.id}]`,
	);

	await next();

	const finalCtx = c.get("ctx");
	const durationMs = Date.now() - finalCtx.timestamp;

	Promise.resolve()
		.then(() => logRequestResult({ ctx: finalCtx, c, skipUrls, durationMs }))
		.catch((error) => {
			console.error("Failed to log response to logtail");
			console.error(error);
		});
};
