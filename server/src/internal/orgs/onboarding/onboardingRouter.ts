import { Router } from "express";

import { eq } from "drizzle-orm";
import { routeHandler } from "@/utils/routerUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { createClerkCli } from "@/external/clerkUtils.js";
import { AppEnv } from "@autumn/shared";
import { parseChatResultFeatures } from "./parseChatFeatures.js";
import { parseChatProducts } from "./parseChatProducts.js";
import { chatResults } from "@autumn/shared";
import { ProductService } from "@/internal/products/ProductService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";

export const onboardingRouter = Router();

onboardingRouter.post("", async (req: Request, res: any) =>
  routeHandler({
    req,
    res,
    action: "onboarding",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { db, sb, logtail: logger, org } = req;
      const { token } = req.body;

      if (!token) {
        throw new RecaseError({
          message: "No token provided",
          code: "no_token_provided",
          statusCode: 400,
        });
      }

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

      let curProducts = await ProductService.getFullProducts({
        sb,
        orgId: org.id,
        env: AppEnv.Sandbox,
      });

      let curFeatures = await FeatureService.list({
        db,
        orgId: org.id,
        env: AppEnv.Sandbox,
      });

      let newProducts = chatResult.data.products.filter((product) => {
        return !curProducts.some((p) => p.id === product.id);
      });

      let newFeatures = chatResult.data.features.filter((feature) => {
        return !curFeatures.some((f) => f.id === feature.id);
      });

      if (newFeatures.length > 0 || newProducts.length > 0) {
        let backendFeatures = parseChatResultFeatures({
          features: newFeatures,
          orgId: org.id,
        });

        let { products, prices, ents } = await parseChatProducts({
          db,
          sb,
          logger,
          orgId: org.id,
          features: [...curFeatures, ...backendFeatures],
          chatProducts: newProducts,
        });

        await Promise.all([
          FeatureService.insert({
            db,
            data: backendFeatures,
            logger,
          }),
          (async () => {
            for (const product of products) {
              await ProductService.create({ sb, product });
            }
          })(),
        ]);

        await EntitlementService.insert({
          db,
          data: ents,
        });

        await PriceService.insert({
          db,
          data: prices,
        });
      }

      res.status(200).json({
        org_id: org.id,
        feature_ids: chatResult.data.features.map((f) => f.id),
        product_ids: chatResult.data.products.map((p) => p.id),
      });
    },
  }),
);
