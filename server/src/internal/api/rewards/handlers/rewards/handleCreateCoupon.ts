import {
  CreateRewardSchema,
  isFixedPrice,
  RewardCategory,
} from "@autumn/shared";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import {
  constructReward,
  getRewardCat,
  initRewardStripePrices,
} from "@/internal/rewards/rewardUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  initProductInStripe,
  isFreeProduct,
} from "@/internal/products/productUtils.js";

export default async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "create coupon",
    handler: async (req, res) => {
      const { db, orgId, env, logtail: logger } = req;
      const rewardBody = req.body;
      const rewardData = CreateRewardSchema.parse(rewardBody);

      const org = await OrgService.getFromReq(req);

      const newReward = constructReward({
        reward: rewardData,
        orgId,
        env,
      });

      if (getRewardCat(newReward) === RewardCategory.Discount) {
        const discountConfig = newReward.discount_config;

        // Get prices for coupon
        const [prices] = await Promise.all([
          PriceService.getInIds({
            db,
            ids: discountConfig!.price_ids || [],
          }),
        ]);

        await initRewardStripePrices({
          db,
          prices,
          org,
          env,
          logger,
        });

        await createStripeCoupon({
          reward: newReward,
          org,
          env,
          prices,
          logger,
          legacyVersion: req.query.legacyStripe === "true",
        });
      }

      if (getRewardCat(newReward) === RewardCategory.FreeProduct) {
        // 1. Check if product is paid
        const fullProduct = await ProductService.getFull({
          db,
          idOrInternalId: newReward.free_product_id!,
          orgId: org.id,
          env,
        });

        await initProductInStripe({
          db,
          product: fullProduct,
          org,
          env,
          logger,
        });

        if (!isFreeProduct(fullProduct.prices)) {
          await createStripeCoupon({
            reward: newReward,
            org,
            env,
            prices: fullProduct.prices
              .filter((price) => isFixedPrice({ price }))
              .map((price) => ({
                ...price,
                product: fullProduct,
              })),
            logger,
          });
        }
      }

      const insertedCoupon = await RewardService.insert({
        db,
        data: newReward,
      });

      res.status(200).json(insertedCoupon);
    },
  });
