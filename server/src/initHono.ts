import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { analyticsMiddleware } from "./honoMiddlewares/analyticsMiddleware.js";
import { apiVersionMiddleware } from "./honoMiddlewares/apiVersionMiddleware.js";
import { baseMiddleware } from "./honoMiddlewares/baseMiddleware.js";
import { errorMiddleware } from "./honoMiddlewares/errorMiddleware.js";
import { orgConfigMiddleware } from "./honoMiddlewares/orgConfigMiddleware.js";
import { queryMiddleware } from "./honoMiddlewares/queryMiddleware.js";
import { refreshCacheMiddleware } from "./honoMiddlewares/refreshCacheMiddleware.js";
import { secretKeyMiddleware } from "./honoMiddlewares/secretKeyMiddleware.js";
import { traceMiddleware } from "./honoMiddlewares/traceMiddleware.js";
import type { HonoEnv } from "./honoUtils/HonoEnv.js";
import { cusRouter } from "./internal/customers/cusRouter.js";
import { honoPlatformRouter } from "./internal/platform/honoPlatformRouter.js";
import { honoProductRouter } from "./internal/products/productRouter.js";
import { auth } from "./utils/auth.js";

const ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:5173",
	"http://localhost:5174",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
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

	// Step 1: Base middleware - sets up ctx (db, logger, etc.)
	app.use("*", baseMiddleware);

	// Step 2: Tracing middleware - handles OpenTelemetry spans
	app.use("*", traceMiddleware);

	// Step 4: Auth middleware - verifies secret key and populates auth context
	app.use("/v1/*", secretKeyMiddleware);

	// Step 5: Org config middleware - allows config overrides via header
	app.use("/v1/*", orgConfigMiddleware);

	// Step 3: API Version middleware - validates x-api-version header
	app.use("/v1/*", apiVersionMiddleware);

	// Step 6: Refresh cache middleware - clears customer cache after successful mutations
	app.use("/v1/*", refreshCacheMiddleware);

	// Step 7: Analytics middleware - enriches logger context and logs responses
	app.use("/v1/*", analyticsMiddleware);

	// Step 8: Query middleware - handles query parsing and validation
	app.use("/v1/*", queryMiddleware());

	app.route("v1/customers", cusRouter);
	app.route("v1/products", honoProductRouter);
	app.route("v1/platform", honoPlatformRouter);

	// Error handler - must be defined after all routes and middleware
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
