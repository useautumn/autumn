import { BALANCE_WORKER_PROXY_PATH } from "@autumn/balance-worker-client";
import { ssoProvider } from "@autumn/shared";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db/initDrizzle.js";
import { autumnWebhookRouter } from "./external/autumn/autumnWebhookRouter.js";
import { revenuecatWebhookRouter } from "./external/revenueCat/revenuecatWebhookRouter.js";
import { stripeWebhookRouter } from "./external/stripe/stripeWebhookRouter.js";
import { vercelTestApiRouter } from "./external/vercel/vercelTestApiRouter.js";
import { vercelWebhookRouter } from "./external/vercel/vercelWebhookRouter.js";
import { baseMiddleware } from "./honoMiddlewares/baseMiddleware.js";
import { errorMiddleware } from "./honoMiddlewares/errorMiddleware/errorMiddleware.js";
import { inFlightTrackingMiddleware } from "./honoMiddlewares/inFlightTrackingMiddleware.js";
import { listReadMiddleware } from "./honoMiddlewares/listReadMiddleware.js";
import { replicaDbMiddleware } from "./honoMiddlewares/replicaDbMiddleware.js";
import { twTestFileMiddleware } from "./honoMiddlewares/twTestFileMiddleware.js";
import type { HonoEnv } from "./honoUtils/HonoEnv.js";
import { handleHealthCheck } from "./honoUtils/handleHealthCheck.js";
import { handleReadyCheck } from "./honoUtils/handleReadyCheck.js";
import { handleCapyLogin } from "./internal/auth/handleCapyLogin.js";
import { handleListAuthOrganizations } from "./internal/auth/handleListAuthOrganizations.js";
import { oauthRouter } from "./internal/auth/oauth/oauthRouter.js";
import { withTrustedSsoOrigin } from "./internal/auth/sso/ssoTrustedOrigins.js";
import { balanceWorkerProxyRouter } from "./internal/balanceWorker/proxy/balanceWorkerProxyRouter.js";
import { atomRouter } from "./internal/byoc/atomRouter.js";
import { cliRouter } from "./internal/dev/cli/cliRouter.js";
import { handleRevenueCatOAuthCallback } from "./internal/orgs/handlers/revenueCatHandlers/handleRevenueCatOAuthCallback.js";
import { handleOAuthCallback } from "./internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js";
import { slackUnfurlRouter } from "./internal/slackUnfurl/slackUnfurlRouter.js";
import { apiRouter } from "./routers/apiRouter.js";
import { createChatProxyRouter } from "./routers/chatProxyRouter.js";
import { internalRouter } from "./routers/internalRouter.js";
import { publicRouter } from "./routers/publicRouter.js";
import { auth, isCapyDev } from "./utils/auth.js";
import { isAllowedOrigin } from "./utils/corsOrigins.js";

const ALLOWED_HEADERS = [
	"app_env",
	"x-sandbox-org-id",
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

const FACADE_ONLY_SSO_PATHS = new Set([
	"/api/auth/sign-in/sso",
	"/api/auth/sso/register",
	"/api/auth/sso/request-domain-verification",
	"/api/auth/sso/verify-domain",
	"/api/auth/sso/providers",
	"/api/auth/sso/get-provider",
	"/api/auth/sso/update-provider",
	"/api/auth/sso/delete-provider",
]);

export const createHonoApp = () => {
	const app = new Hono<HonoEnv>();

	app.use("*", twTestFileMiddleware);
	app.route("", createChatProxyRouter());

	app.use(
		"*",
		cors({
			origin: isAllowedOrigin,
			allowHeaders: ALLOWED_HEADERS,
			allowMethods: ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS"],
			exposeHeaders: ["Content-Length"],
			maxAge: 600,
			credentials: true,
		}),
	);

	app.route("", oauthRouter);

	// Better Auth's joined Drizzle query defaults to 100 memberships.
	app.get("/api/auth/organization/list", handleListAuthOrganizations);
	if (isCapyDev) app.get("/api/auth/capy-login", handleCapyLogin);

	app.on(["POST", "GET"], ["/api/auth/*"], async (c) => {
		if (FACADE_ONLY_SSO_PATHS.has(c.req.path)) {
			return c.json({ message: "Use the Autumn SSO flow" }, 404);
		}
		const callbackMatch = c.req.path.match(
			/^\/api\/auth\/sso\/callback\/([^/]+)$/,
		);
		if (callbackMatch?.[1]) {
			const providerId = decodeURIComponent(callbackMatch[1]);
			const provider = await db.query.ssoProvider.findFirst({
				where: eq(ssoProvider.providerId, providerId),
			});
			if (!provider) {
				return c.json({ message: "SSO provider not found" }, 404);
			}
			return withTrustedSsoOrigin({
				origin: new URL(provider.issuer).origin,
				run: () => auth.handler(c.req.raw),
			});
		}
		return auth.handler(c.req.raw);
	});

	app.get("/stripe/oauth_callback", handleOAuthCallback);
	app.get("/revenuecat/oauth_callback", handleRevenueCatOAuthCallback);
	app.get("/ready/:token", handleReadyCheck);
	app.get("/", handleHealthCheck);

	app.route("/slack-unfurl", slackUnfurlRouter);

	app.use(
		"*",
		httpInstrumentationMiddleware({
			serviceName: "autumn-server",
			serviceVersion: "1.0.0",
		}),
	);
	app.use("*", inFlightTrackingMiddleware);
	app.use("*", baseMiddleware);
	app.use("*", replicaDbMiddleware);
	app.use("*", listReadMiddleware);

	app.route("/cli", cliRouter);

	app.route(BALANCE_WORKER_PROXY_PATH, balanceWorkerProxyRouter);

	app.route("/atom", atomRouter);

	app.use("*", async (c, next) => {
		await next();
		c.header("x-region", process.env.AWS_REGION);
	});

	app.route("", stripeWebhookRouter);
	app.route("/webhooks/autumn", autumnWebhookRouter);
	app.route("/webhooks/vercel", vercelWebhookRouter);
	app.route("/webhooks/revenuecat", revenuecatWebhookRouter);

	if (process.env.NODE_ENV !== "production") {
		app.route("/__test/vercel/api", vercelTestApiRouter);
	}

	app.route("", publicRouter);
	app.route("/v1", apiRouter);

	app.all("/.well-known/*", (c) => c.json({ error: "not_found" }, 404));

	app.route("", internalRouter);

	app.onError(errorMiddleware);

	return app;
};
