import { oauthClient } from "@autumn/shared";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { getRequestListener } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { autumnWebhookRouter } from "./external/autumn/autumnWebhookRouter.js";
import { revenuecatWebhookRouter } from "./external/revenueCat/revenuecatWebhookRouter.js";
import { stripeWebhookRouter } from "./external/stripe/stripeWebhookRouter.js";
import { vercelWebhookRouter } from "./external/vercel/vercelWebhookRouter.js";
import { baseMiddleware } from "./honoMiddlewares/baseMiddleware.js";
import { errorMiddleware } from "./honoMiddlewares/errorMiddleware.js";
import { traceMiddleware } from "./honoMiddlewares/traceMiddleware.js";
import type { HonoEnv } from "./honoUtils/HonoEnv.js";
import { handleHealthCheck } from "./honoUtils/handleHealthCheck.js";
import { cliRouter } from "./internal/dev/cli/cliRouter.js";
import { handleOAuthCallback } from "./internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js";
import { apiRouter } from "./routers/apiRouter.js";
import { internalRouter } from "./routers/internalRouter.js";
import { publicRouter } from "./routers/publicRouter.js";
import { auth } from "./utils/auth.js";

const ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
	"http://localhost:3003",
	"http://localhost:3004",
	"http://localhost:3005",
	"http://localhost:3006",
	"http://localhost:3007",
	"http://localhost:5173",
	"http://localhost:5174",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
	"https://dev.useautumn.com",
	"https://api.staging.useautumn.com",
	"https://localhost:8080",
];

const ALLOWED_HEADERS = [
	"app_env",
	"x-api-version",
	"x-client-type",
	"x-request-id",
	"x-visitor-id",
	"Authorization",
	"Content-Type",
	"Accept",
	"Origin",
	"X-API-Version",
	"X-Requested-With",
	"Access-Control-Request-Method",
	"Access-Control-Request-Headers",
	"Cache-Control",
	"If-Match",
	"If-None-Match",
	"If-Modified-Since",
	"If-Unmodified-Since",
	"idempotency-key",
	"Idempotency-Key",
	"User-Agent", // Required for better-auth v1.4.0+ compatibility with Safari/Zen browser
];

const createHonoApp = () => {
	const app = new Hono<HonoEnv>();

	// CORS configuration (must be before routes)
	app.use(
		"*",
		cors({
			origin: ALLOWED_ORIGINS,
			allowHeaders: ALLOWED_HEADERS,
			allowMethods: ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS"],
			exposeHeaders: ["Content-Length"],
			maxAge: 600,
			credentials: true,
		}),
	);

	app.get("/api/auth/.well-known/openid-configuration", (c) => {
		return oauthProviderOpenIdConfigMetadata(auth)(c.req.raw);
	});

	app.get("/.well-known/oauth-authorization-server/api/auth", (c) => {
		return oauthProviderAuthServerMetadata(auth)(c.req.raw);
	});

	app.on(["POST", "GET"], "/api/auth/*", (c) => {
		return auth.handler(c.req.raw);
	});

	// OAuth callback (needs to be before middleware)
	// Health check endpoint for AWS/ECS load balancer

	app.get("/stripe/oauth_callback", handleOAuthCallback);

	// Step 1: Base middleware - sets up ctx (db, logger, etc.)
	app.use("*", baseMiddleware);
	app.use("*", traceMiddleware);

	app.get("/", handleHealthCheck);

	// Public endpoint to get OAuth client name (for consent page)
	app.get("/oauth/client/:client_id", async (c) => {
		const clientId = c.req.param("client_id");
		if (!clientId) {
			return c.json({ error: "client_id is required" }, 400);
		}

		const db = c.get("ctx").db;
		const client = await db
			.select({
				name: oauthClient.name,
				clientId: oauthClient.clientId,
			})
			.from(oauthClient)
			.where(eq(oauthClient.clientId, clientId))
			.limit(1);

		if (!client.length) {
			return c.json({ error: "Client not found" }, 404);
		}

		return c.json({
			client_id: client[0].clientId,
			name: client[0].name || "Unknown Application",
		});
	});

	// CLI routes (uses Bearer token auth, not session auth)
	app.route("/cli", cliRouter);

	// Add Render region identifier header for load balancer verification
	app.use("*", async (c, next) => {
		await next();
		c.header("x-region", process.env.AWS_REGION);
	});

	// Webhook routes
	app.route("", stripeWebhookRouter);
	app.route("/webhooks/autumn", autumnWebhookRouter);
	app.route("/webhooks/vercel", vercelWebhookRouter);
	app.route("/webhooks/revenuecat", revenuecatWebhookRouter);

	// Public routes (no auth required)
	app.route("", publicRouter);
	// API Middleware
	app.route("/v1", apiRouter);
	app.route("", internalRouter);

	app.onError(errorMiddleware);

	// Create request listener for integration with Express
	const requestListener = getRequestListener(app.fetch);
	return { honoApp: app, requestListener };
};

/**
 * Smart middleware that checks if Hono has a matching route.
 * If yes: forwards the request to Hono (fresh, unmodified)
 * If no: calls next() to continue Express flow (untouched)
 */
export const redirectToHono = () => {
	const { honoApp, requestListener } = createHonoApp();

	// Get all routes from Hono app
	const routes = honoApp.routes;

	return async (req: any, res: any, next: any) => {
		const method = req.method;
		const path = req.path;

		// Check if Hono has a matching route for this method + path
		const hasMatch = routes.some((route) => {
			// Check if method matches
			if (route.method !== method && route.method !== "ALL") {
				return false;
			}

			// Check if path matches (handle dynamic routes)
			const routePath = route.path;

			// Exact match
			if (routePath === path) {
				return true;
			}

			// Check for wildcard patterns (e.g., /api/autumn/*)
			if (routePath.endsWith("/*")) {
				const basePath = routePath.slice(0, -2); // Remove "/*"
				if (path.startsWith(`${basePath}/`) || path === basePath) {
					return true;
				}
			}

			// Check for dynamic routes (e.g., /v1/products/:id)
			if (routePath.includes(":")) {
				const routeRegex = new RegExp(
					`^${routePath.replace(/:[^/]+/g, "([^/]+)")}$`,
				);
				return routeRegex.test(path);
			}

			return false;
		});

		if (hasMatch) {
			// Route exists in Hono - forward the FRESH request
			return requestListener(req, res);
		}

		// No match - continue to Express (completely untouched)
		next();
	};
};
