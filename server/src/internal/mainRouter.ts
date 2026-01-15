import "dotenv/config";

import { autumnHandler } from "autumn-js/express";
import { Router } from "express";
import { withOrgAuth } from "../middleware/authMiddleware.js";
import { analyticsRouter } from "./analytics/internalAnalyticsRouter.js";

import { viewsRouter } from "./saved-views/savedViewsRouter.js";

const mainRouter: Router = Router();

mainRouter.use("/query", withOrgAuth, analyticsRouter);
mainRouter.use("/saved_views", withOrgAuth, viewsRouter);

// Optional...
if (process.env.AUTUMN_SECRET_KEY) {
	mainRouter.use(
		"/api/autumn",
		withOrgAuth,
		autumnHandler({
			// url: `${process.env.BETTER_AUTH_URL}/v1`,
			identify: async (req: any) => {
				return {
					customerId: req.org?.id,
					customerData: {
						name: req.org?.slug,
						email: req.user?.email,
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

export default mainRouter;
