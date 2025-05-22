import { Router } from "express";
import { Request } from "@/utils/models/Request.js";
import { chatResults } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { routeHandler } from "@/utils/routerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { createClerkCli } from "@/external/clerkUtils.js";
import { handleOrgCreated } from "@/external/webhooks/clerkWebhooks.js";
import { OrgService } from "../OrgService.js";
import { AppEnv } from "@autumn/shared";
import { parseChatResultFeatures } from "./parseChatFeatures.js";
import { parseChatProducts } from "./parseChatProducts.js";

export const onboardingRouter = Router();

onboardingRouter.post("", async (req: Request, res: any) =>
  routeHandler({
    req,
    res,
    action: "onboarding",
    handler: async (req: Request, res: any) => {
      const { db, userId } = req;
      const { token } = req.body;

      if (!token) {
        throw new RecaseError({
          message: "No token provided",
          code: "no_token_provided",
          statusCode: 400,
        });
      }

      // 1. Get chat result
      let chatResult = await db.query.chatResults.findFirst({
        where: eq(chatResults.id, token),
      });

      if (!chatResult) {
        throw new RecaseError({
          message: `Chat result from token ${token} not found`,
          code: "chat_result_not_found",
          statusCode: 404,
        });
      }

      let clerk = createClerkCli();
      let user = await clerk.users.getUser(userId!);

      // console.log(`Creating default org for user ${user.id}`);
      // let org = await clerk.organizations.createOrganization({
      //   name: `${user.firstName}'s Org`,
      // });

      // // 2. Create org membership for user
      // await clerk.organizations.createOrganizationMembership({
      //   organizationId: org.id,
      //   userId: userId!,
      //   role: "org:admin",
      // });

      // // 3. Create org in db
      // await handleOrgCreated(db, {
      //   id: org.id,
      //   slug: org.slug,
      //   created_at: org.createdAt,
      // });

      // 4. Create new products
      let features = chatResult?.data.features;
      let products = chatResult?.data.products;

      let backendFeatures = parseChatResultFeatures(features);
      let backendProducts = parseChatProducts({
        features: backendFeatures,
        chatProducts: products,
      });

      console.log(backendFeatures);

      // for (const feature of features) {
      //   await ProductService.create({
      //     sb,
      //     product: feature,
      //   });
      // }

      res.status(200).json({
        message: "Onboarding successful",
      });
    },
  }),
);
