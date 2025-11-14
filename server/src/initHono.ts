import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleConnectWebhook } from "./external/webhooks/connectWebhookRouter.js";
import { analyticsMiddleware } from "./honoMiddlewares/analyticsMiddleware.js";
import { apiVersionMiddleware } from "./honoMiddlewares/apiVersionMiddleware.js";
import { baseMiddleware } from "./honoMiddlewares/baseMiddleware.js";
import { betterAuthMiddleware } from "./honoMiddlewares/betterAuthMiddleware.js";
import { errorMiddleware } from "./honoMiddlewares/errorMiddleware.js";
import { orgConfigMiddleware } from "./honoMiddlewares/orgConfigMiddleware.js";
import { queryMiddleware } from "./honoMiddlewares/queryMiddleware.js";
import { refreshCacheMiddleware } from "./honoMiddlewares/refreshCacheMiddleware.js";
import { secretKeyMiddleware } from "./honoMiddlewares/secretKeyMiddleware.js";
import { traceMiddleware } from "./honoMiddlewares/traceMiddleware.js";
import type { HonoEnv } from "./honoUtils/HonoEnv.js";
import { balancesRouter } from "./internal/balances/balancesRouter.js";
import { billingRouter } from "./internal/billing/billingRouter.js";
import { cusRouter } from "./internal/customers/cusRouter.js";
import { internalCusRouter } from "./internal/customers/internalCusRouter.js";
import { entityRouter } from "./internal/entities/entityRouter.js";
import { featureRouter } from "./internal/features/featureRouter.js";
import { handleOAuthCallback } from "./internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js";
import { honoOrgRouter } from "./internal/orgs/orgRouter.js";
import { platformBetaRouter } from "./internal/platform/platformBeta/platformBetaRouter.js";
import { internalProductRouter } from "./internal/products/internalProductRouter.js";
import {
	honoProductBetaRouter,
	honoProductRouter,
	migrationRouter,
} from "./internal/products/productRouter.js";
import { auth } from "./utils/auth.js";

const ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:5173",
	"http://localhost:5174",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
	"https://api.staging.useautumn.com",
	"https://localhost:8080",
];

const ALLOWED_HEADERS = [
	"app_env",
	"x-api-version",
	"x-client-type",
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
];

export const createHonoApp = () => {
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

	// Better Auth handler
	app.on(["POST", "GET"], "/api/auth/*", (c) => {
		return auth.handler(c.req.raw);
	});

	// OAuth callback (needs to be before middleware)
	// Health check endpoint for AWS/ECS load balancer
	app.get("/", (c) => {
		return c.text("Hello from Autumn 🍂🍂🍂");
	});

	app.get("/stripe/oauth_callback", handleOAuthCallback);

	// Step 1: Base middleware - sets up ctx (db, logger, etc.)
	app.use("*", baseMiddleware);
	app.use("*", traceMiddleware);

	// Add Render region identifier header for load balancer verification
	app.use("*", async (c, next) => {
		await next();
		c.header("x-region", process.env.AWS_REGION);
	});

	// Webhook routes
	app.post("/webhooks/connect/:env", handleConnectWebhook);

	// API Middleware
	app.use("/v1/*", secretKeyMiddleware);
	app.use("/v1/*", orgConfigMiddleware);
	app.use("/v1/*", apiVersionMiddleware);
	app.use("/v1/*", analyticsMiddleware);
	app.use("/v1/*", refreshCacheMiddleware);
	app.use("/v1/*", queryMiddleware());

	// General org rate limiter for all other /v1/* routes
	// app.use("/v1/*", generalRateLimiter);

	app.route("v1", billingRouter);
	app.route("v1", balancesRouter);
	app.route("v1", migrationRouter);
	app.route("v1", entityRouter);
	app.route("v1/customers", cusRouter);

	app.route("v1/products_beta", honoProductBetaRouter);
	app.route("v1/products", honoProductRouter);
	app.route("v1/plans", honoProductRouter);
	app.route("v1/features", featureRouter);

	app.route("v1", balancesRouter);
	app.route("v1/platform", platformBetaRouter);
	app.route("v1/platform/beta", platformBetaRouter);
	app.route("v1/organization", honoOrgRouter);

	// Internal/dashboard routes - use betterAuthMiddleware for session auth
	app.use("/products/*", betterAuthMiddleware);
	app.route("/products", internalProductRouter);
	app.use("/customers/*", betterAuthMiddleware);
	app.route("/customers", internalCusRouter);

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
