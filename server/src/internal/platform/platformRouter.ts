import { generateId } from "better-auth";
import { NextFunction, Router } from "express";
import { member, organizations, user as userTable } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { slugify } from "@/utils/genUtils.js";
import { eq } from "drizzle-orm";
import { connectStripe } from "../orgs/handlers/handleConnectStripe.js";
import { z } from "zod";

const platformRouter = Router();

const platformAuthMiddleware = (req: any, res: any, next: NextFunction) => {
  next();
};

platformRouter.use(platformAuthMiddleware);

const ExchangeSchema = z.object({
  organization: z.string(),
  email: z.string(),
  stripe_test_key: z.string().nonempty(),
  stripe_live_key: z.string().nonempty(),
});

platformRouter.post("/exchange", (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "exchange",
    handler: async (req: ExtendedRequest, res: any) => {
      let { organization, email, stripe_test_key, stripe_live_key } = req.body;

      // 1. Create user with email
      const { db } = req;

      // let user = await db.insert(userTable).values({
      //   id: generateId(),
      //   name: "",
      //   email,
      //   emailVerified: true,
      //   createdAt: new Date(),
      //   updatedAt: new Date(),
      //   role: "user",
      //   banned: false,
      //   banReason: null,
      //   banExpires: null,
      // });

      // let { defaultCurrency, stripeConfig } = await connectStripe({
      //   db,
      //   orgId: generateId(),
      //   logger: req.logtail,
      //   testApiKey: stripe_test_key,
      //   liveApiKey: stripe_live_key,
      //   successUrl: "https://useautumn.com",
      // });

      // // 2. Create org
      // let orgId = generateId();
      // await db.insert(organizations).values({
      //   id: orgId,
      //   slug: `${slugify(organization)}_${Math.floor(10000000 + Math.random() * 90000000)}`,
      //   name: organization,
      //   logo: "",
      //   createdAt: new Date(),
      //   metadata: "",
      //   stripe_connected: true,
      //   default_currency: defaultCurrency,
      //   stripe_config: stripeConfig,
      // });

      // // 3. Create membership
      // await db.insert(member).values({
      //   id: generateId(),
      //   organizationId: orgId,
      //   userId: user!.id,
      //   role: "owner",
      //   createdAt: new Date(),
      // });

      res.status(200).json({
        // message: "User created",
        // user,
      });
    },
  })
);

export { platformRouter };
