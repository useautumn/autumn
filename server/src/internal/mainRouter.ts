import { orgRouter } from "./orgs/orgRouter.js";
import { Router } from "express";
import { userRouter } from "./users/userRouter.js";
import { withAuth, withOrgAuth } from "../middleware/authMiddleware.js";
import { featureRouter } from "./features/featureRouter.js";
import { creditsRouter } from "./credits/creditsRouter.js";
import { productRouter } from "./products/internalProductRouter.js";
import { devRouter } from "./dev/devRouter.js";
import { cusRouter } from "./customers/internalCusRouter.js";
import { testRouter } from "./test/testRouter.js";
import { createClerkCli } from "../external/clerkUtils.js";
import { ErrCode } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { STATUS_CODES } from "http";
import { StatusCodes } from "http-status-codes";
import { handleOrgCreated } from "@/external/webhooks/clerkWebhooks.js";

const mainRouter = Router();

mainRouter.get("", (req: any, res) => {
  res.status(200).json({ message: "Hello World" });
});

mainRouter.post("/organization", withAuth, async (req: any, res) => {
  try {
    let { orgId } = req.body;

    let userId = req.userId;
    let clerk = createClerkCli();

    let org = await clerk.organizations.getOrganization({
      organizationId: orgId,
    });

    if (!org) {
      throw new RecaseError({
        message: "Organization not found",
        code: ErrCode.OrgNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const memberships = await clerk.users.getOrganizationMembershipList({
      userId: userId,
    });

    let userIsAdmin = memberships.data.some((m) => m.organization.id === orgId);

    if (!userIsAdmin) {
      throw new RecaseError({
        message: "User is not an admin of this organization",
        code: ErrCode.OrgNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    handleOrgCreated(req.sb, {
      id: orgId,
      slug: org.slug || "",
      created_at: Date.now(),
    });

    res.status(200).json({ message: "Success" });
  } catch (error: any) {
    handleRequestError({ error, req, res, action: "create org" });
  }
});

mainRouter.use("/users", withAuth, userRouter);
mainRouter.use("/organization", withOrgAuth, orgRouter);
mainRouter.use("/features", withOrgAuth, featureRouter);
mainRouter.use("/credits", withOrgAuth, creditsRouter);
mainRouter.use("/products", withOrgAuth, productRouter);
mainRouter.use("/dev", devRouter);
mainRouter.use("/customers", withOrgAuth, cusRouter);
mainRouter.use("/test", testRouter);
export default mainRouter;
