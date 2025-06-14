import dotenv from "dotenv";
dotenv.config();

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
import { Autumn } from "autumn-js";
import { autumnHandler } from "autumn-js/express";
import { parseAuthHeader } from "@/utils/authUtils.js";
import { withAdminAuth } from "./admin/withAdminAuth.js";
import { adminRouter } from "./admin/adminRouter.js";

const mainRouter = Router();

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

mainRouter.use(
  "/demo/api/autumn",
  withOrgAuth,

  autumnHandler({
    autumn: (req: any) => {
      // let bearerToken = parseAuthHeader(req);

      return new Autumn({
        // secretKey: bearerToken,
        url: "http://localhost:8080/v1",
        headers: req.headers,
      }) as any;
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
