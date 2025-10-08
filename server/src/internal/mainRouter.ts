import "dotenv/config";

import { Autumn } from "autumn-js";
import { autumnHandler } from "autumn-js/express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createStripeCli } from "@/external/stripe/utils.js";
import { withAuth, withOrgAuth } from "../middleware/authMiddleware.js";
import { adminRouter } from "./admin/adminRouter.js";
import { withAdminAuth } from "./admin/withAdminAuth.js";
import { analyticsRouter } from "./analytics/internalAnalyticsRouter.js";
import { trmnlRouter } from "./api/trmnl/trmnlRouter.js";
import { cusRouter } from "./customers/internalCusRouter.js";
import { devRouter } from "./dev/devRouter.js";
import { internalFeatureRouter } from "./features/internalFeatureRouter.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { handlePostOrg } from "./orgs/handlers/handlePostOrg.js";
import { onboardingRouter } from "./orgs/onboarding/onboardingRouter.js";
import { orgRouter } from "./orgs/orgRouter.js";
import { productRouter } from "./products/internalProductRouter.js";
import { viewsRouter } from "./saved-views/savedViewsRouter.js";
import { userRouter } from "./users/userRouter.js";

const mainRouter: Router = Router();

mainRouter.get("", async (req: any, res) => {
	res.status(200).json({ message: "Hello World" });
});

mainRouter.post("/organization", withAuth, handlePostOrg);
mainRouter.use("/admin", withAdminAuth, adminRouter);
mainRouter.use("/users", withAuth, userRouter);
mainRouter.use("/onboarding", withOrgAuth, onboardingRouter);
mainRouter.use("/organization", withOrgAuth, orgRouter);
mainRouter.use("/features", withOrgAuth, internalFeatureRouter);
mainRouter.use("/products", withOrgAuth, productRouter);
mainRouter.use("/dev", devRouter);
mainRouter.use("/customers", withOrgAuth, cusRouter);
mainRouter.use("/query", withOrgAuth, analyticsRouter);
mainRouter.use("/saved_views", withOrgAuth, viewsRouter);

mainRouter.use("/trmnl", trmnlRouter);

const limiter = rateLimit({
	windowMs: 60 * 1000, // 15 minutes
	limit: 10, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
});

mainRouter.use(
	"/invoices/hosted_invoice_url/:invoiceId",
	limiter,
	async (req: any, res: any) => {
		const invoiceId = req.params.invoiceId;
		const invoice = await InvoiceService.get({
			db: req.db,
			id: invoiceId,
		});

		if (!invoice) return res.status(404).json({ error: "Invoice not found" });

		try {
			const org = invoice.customer.org;
			const env = invoice.customer.env;
			const stripeCli = createStripeCli({
				org,
				env,
			});
			const stripeInvoice = await stripeCli.invoices.retrieve(
				invoice.stripe_id,
			);

			if (stripeInvoice.status === "draft") {
				return res
					.status(404)
					.json({ error: "This invoice is in draft status and has no URL" });
			}

			res.redirect(stripeInvoice.hosted_invoice_url);
		} catch (e) {
			console.error(e);
			return res.status(500).json({ error: "Error retrieving invoice" });
		}
	},
);

// Optional...
if (process.env.AUTUMN_SECRET_KEY) {
	mainRouter.use(
		"/api/autumn",
		withOrgAuth,
		autumnHandler({
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

mainRouter.use(
	"/demo/api/autumn",
	withOrgAuth,
	autumnHandler({
		autumn: (req: any) => {
			const client = new Autumn({
				url: "http://localhost:8080/v1",
				headers: {
					cookie: req.headers.cookie,
					"Content-Type": "application/json",
					origin: req.get("origin"),
				},
			});
			return client as any;
		},
		identify: async (req: any) => {
			return {
				customerId: "onboarding_demo_user",
				customerData: {
					name: "Demo User",
					email: "demo@useautumn.com",
				},
			};
		},
	}),
);

export default mainRouter;
