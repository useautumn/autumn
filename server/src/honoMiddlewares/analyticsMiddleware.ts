import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const parseCustomerIdFromUrl = ({
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

/**
 * Logs response details asynchronously without blocking
 */
const logResponse = async ({
	ctx,
	c,
	method,
	skipUrls,
}: {
	ctx: any;
	c: Context<HonoEnv>;
	method: string;
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
			ctx.logger.info(
				`[${c.res.status}] ${method} ${c.req.path} (${ctx.org?.slug})`,
				{
					statusCode: c.res.status,
					res: responseBody,
				},
			);
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
	let requestBody: any = null;
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
		requestBody?.customer_id || parseCustomerIdFromUrl({ url: c.req.path });

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
		.then(() => logResponse({ ctx, c, method, skipUrls }))
		.catch((error) => {
			console.error("Failed to log response to logtail");
			console.error(error);
		});
};
