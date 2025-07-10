import "dotenv/config";

import { orgRouter } from "./orgs/orgRouter.js";
import { Router } from "express";
import { userRouter } from "./users/userRouter.js";
import { withAuth, withOrgAuth } from "../middleware/authMiddleware.js";
import { featureRouter } from "./features/featureRouter.js";
import { productRouter } from "./products/internalProductRouter.js";
import { devRouter } from "./dev/devRouter.js";
import { cusRouter } from "./customers/internalCusRouter.js";
import { onboardingRouter } from "./orgs/onboarding/onboardingRouter.js";
import { handlePostOrg } from "./orgs/handlers/handlePostOrg.js";
import { withAdminAuth } from "./admin/withAdminAuth.js";
import { adminRouter } from "./admin/adminRouter.js";
import { autumnHandler } from "autumn-js/express";
import { Autumn } from "autumn-js";
import { analyticsRouter } from "./analytics/internalAnalyticsRouter.js";

const mainRouter: Router = Router();

mainRouter.get("", async (req: any, res) => {
  res.status(200).json({ message: "Hello World" });
});

mainRouter.post("/organization", withAuth, handlePostOrg);
mainRouter.use("/admin", withAdminAuth, adminRouter);
mainRouter.use("/users", withAuth, userRouter);
mainRouter.use("/onboarding", withOrgAuth, onboardingRouter);
mainRouter.use("/organization", withOrgAuth, orgRouter);
mainRouter.use("/features", withOrgAuth, featureRouter);
mainRouter.use("/products", withOrgAuth, productRouter);
mainRouter.use("/dev", devRouter);
mainRouter.use("/customers", withOrgAuth, cusRouter);
mainRouter.use("/analytics", withOrgAuth, analyticsRouter);

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
      let client = new Autumn({
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
        customerId: "user_123",
        customerData: {
          name: "Demo User",
          email: "demo@useautumn.com",
        },
      };
    },
  }),
);

export default mainRouter;
