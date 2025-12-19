import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

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
		path.startsWith("/v1/customers") && method === "POST";
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
 * Logs response details asynchronously without blocking
 */
const logResponse = async ({
	ctx,
	c,
	skipUrls,
}: {
	ctx: any;
	c: Context<HonoEnv>;
	skipUrls: string[];
}) => {
	try {
		// Skip logging for certain URLs
		if (skipUrls.includes(c.req.path)) {
			return;
		}

		// Try to extract response body if it's JSON
		let responseBody: any = null;
		const contentType = c.res.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			try {
				// Clone response to read body without consuming it
				const clonedResponse = c.res.clone();
				responseBody = await clonedResponse.json();
			} catch (_error) {
				// Response might not be JSON or already consumed
			}
		}

		// Log response in non-development environments
		if (process.env.NODE_ENV !== "development") {
			const log = c.res.status === 200 ? ctx.logger.info : ctx.logger.warn;
			log(`[${c.res.status}] ${c.req.path} (${ctx.org?.slug})`, {
				statusCode: c.res.status,
				res: responseBody,
			});
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

	// Parse request body for customer_id
	let requestBody: Record<string, unknown> | null = null;
	const method = c.req.method;
	if (method === "POST" || method === "PUT" || method === "PATCH") {
		try {
			// Clone the request to read body without consuming it
			requestBody = await c.req.json();
		} catch (_error) {
			// Body might not be JSON, that's okay
		}
	}

	const customerId =
		extractCustomerIdFromBody({
			body: requestBody ?? {},
			path: c.req.path,
			method,
		}) || parseCustomerIdFromUrl({ url: c.req.path });

	// Enrich logger context
	const reqContext = {
		org_id: ctx.org?.id,
		org_slug: ctx.org?.slug,
		env: ctx.env,
		authType: ctx.authType,
		body: requestBody,
		customer_id: customerId,
		user_id: ctx.userId || null,
	};

	// Update logger with enriched context
	ctx.logger = ctx.logger.child({
		context: {
			context: reqContext,
		},
	});

	ctx.logger.info(`${method} ${c.req.path} (${ctx.org?.slug})`);

	// Execute the request
	await next();

	// Log response asynchronously without blocking (runs after response is sent)
	Promise.resolve()
		.then(() => logResponse({ ctx, c, skipUrls }))
		.catch((error) => {
			console.error("Failed to log response to logtail");
			console.error(error);
		});
};
