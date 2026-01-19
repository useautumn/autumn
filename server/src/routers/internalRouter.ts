import { autumnHandler } from "autumn-js/hono";
import { Hono } from "hono";
import { internalTrmnlRouter } from "@/internal/misc/trmnl/trmnlRouter.js";
import { adminAuthMiddleware } from "../honoMiddlewares/adminAuthMiddleware";
import { analyticsMiddleware } from "../honoMiddlewares/analyticsMiddleware";
import { apiVersionMiddleware } from "../honoMiddlewares/apiVersionMiddleware";
import { betterAuthMiddleware } from "../honoMiddlewares/betterAuthMiddleware";
import { orgConfigMiddleware } from "../honoMiddlewares/orgConfigMiddleware";
import { queryMiddleware } from "../honoMiddlewares/queryMiddleware";
import { refreshCacheMiddleware } from "../honoMiddlewares/refreshCacheMiddleware";
import type { HonoEnv } from "../honoUtils/HonoEnv";
import { honoAdminRouter } from "../internal/admin/adminRouter";
import { internalAnalyticsRouter } from "../internal/analytics/internalAnalyticsRouter";
import { internalCusRouter } from "../internal/customers/internalCusRouter";
import { consentRouter } from "../internal/dev/consent/consentRouter";
import { internalDevRouter } from "../internal/dev/devRouter";
import { feedbackRouter } from "../internal/misc/feedback/feedbackRouter";
import { pricingAgentRouter } from "../internal/misc/pricingAgent/pricingAgentRouter";
import { savedViewsRouter } from "../internal/misc/savedViews/savedViewsRouter";
import { internalOrgRouter } from "../internal/orgs/orgRouter";
import { internalProductRouter } from "../internal/products/internalProductRouter";

export const internalRouter = new Hono<HonoEnv>();

// Internal/dashboard routes - use betterAuthMiddleware for session auth
internalRouter.use("*", betterAuthMiddleware);
internalRouter.use("*", orgConfigMiddleware);
internalRouter.use("*", apiVersionMiddleware);
internalRouter.use("*", analyticsMiddleware);
internalRouter.use("*", refreshCacheMiddleware);
internalRouter.use("*", queryMiddleware());

internalRouter.use("/admin/*", adminAuthMiddleware);
internalRouter.route("admin", honoAdminRouter);

internalRouter.route("organization", internalOrgRouter);
internalRouter.route("/products", internalProductRouter);
internalRouter.route("/customers", internalCusRouter);
internalRouter.route("/dev", internalDevRouter);
internalRouter.route("/consents", consentRouter);
internalRouter.route("/pricing-agent", pricingAgentRouter);
internalRouter.route("/trmnl", internalTrmnlRouter);
internalRouter.route("/feedback", feedbackRouter);
internalRouter.route("/saved_views", savedViewsRouter);
internalRouter.route("/query", internalAnalyticsRouter);

// Autumn SDK handler (requires session auth)
if (process.env.AUTUMN_SECRET_KEY) {
	internalRouter.use(
		"/api/autumn/*",
		autumnHandler({
			identify: async (c) => {
				const ctx = c.get("ctx");

				return {
					customerId: ctx.org?.id,
					customerData: {
						name: ctx.org?.slug,
						email: ctx.user?.email,
					},
				};
			},
		}),
	);
}

// mainRouter.use(
// 	"/demo/api/autumn",
// 	withOrgAuth,
// 	autumnHandler({
// 		autumn: (req: any) => {
// 			const client = new Autumn({
// 				url: "http://localhost:8080/v1",
// 				headers: {
// 					cookie: req.headers.cookie,
// 					"Content-Type": "application/json",
// 					origin: req.get("origin"),
// 					"x-client-type": "dashboard",
// 					app_env: req.env || req.headers.app_env,
// 				},
// 			});
// 			return client as any;
// 		},
// 		identify: async (req: any) => {
// 			return {
// 				customerId: "onboarding_demo_user",
// 				customerData: {
// 					name: "Demo User",
// 					email: "demo@useautumn.com",
// 				},
// 			};
// 		},
// 	}),
// );
