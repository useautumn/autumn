import { orgRouter } from "./orgs/orgRouter.js";
import { Router } from "express";
import { userRouter } from "./users/userRouter.js";
import { withAuth, withOrgAuth } from "../middleware/authMiddleware.js";
import { featureRouter } from "./features/featureRouter.js";
import { creditsRouter } from "./credits/creditsRouter.js";
import { productRouter } from "./products/internalProductRouter.js";
import { devRouter } from "./dev/devRouter.js";
import { cusRouter } from "./customers/internalCusRouter.js";

const mainRouter = Router();

mainRouter.get("", (req: any, res) => {
  res.status(200).json({ message: "Hello World" });
});

// mainRouter.use("", envMiddleware);
mainRouter.use("/users", withAuth, userRouter);
mainRouter.use("/organization", withOrgAuth, orgRouter);
// mainRouter.use("/webhooks", webhooksRouter);

mainRouter.use("/features", withOrgAuth, featureRouter);
mainRouter.use("/credits", withOrgAuth, creditsRouter);
mainRouter.use("/products", withOrgAuth, productRouter);
mainRouter.use("/dev", devRouter);
mainRouter.use("/customers", withOrgAuth, cusRouter);

export default mainRouter;
