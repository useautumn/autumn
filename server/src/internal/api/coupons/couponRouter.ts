import express from "express";
import { CouponDurationType, CreateCouponSchema } from "@autumn/shared";
import { handleRequestError } from "@/utils/errorUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { initCoupon } from "@/internal/coupons/couponUtils.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils.js";
import { CouponService } from "@/internal/coupons/CouponService.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
const couponRouter = express.Router();

couponRouter.post("", async (req: any, res: any) => {
  try {
    const { orgId, env } = req;
    const couponBody = req.body;

    const couponData = CreateCouponSchema.parse(couponBody);
    const org = await OrgService.getFromReq(req);
    const newCoupon = initCoupon({
      coupon: couponData,
      orgId,
      env,
      id: couponBody.id,
    });

    const stripeCli = createStripeCli({
      org,
      env,
    });

    // Get prices for coupon
    const [prices, entitlements] = await Promise.all([
      PriceService.getPricesFromIds({
        sb: req.sb,
        priceIds: newCoupon.price_ids,
      }),
      EntitlementService.getFullEntitlements({
        sb: req.sb,
        orgId,
        env,
      }),
    ]);

    if (!newCoupon.apply_to_all) {
      // Create stripe prices if not exists

      const batchSize = 5;

      for (let i = 0; i < prices.length; i += batchSize) {
        const batch = prices.slice(i, i + batchSize);
        const batchPriceCreate = batch.map((price) =>
          createStripePriceIFNotExist({
            stripeCli,
            price,
            entitlements,
            org,
            logger: req.logger,
            sb: req.sb,
            product: price.product,
          })
        );
        await Promise.all(batchPriceCreate);
      }
    }

    await createStripeCoupon({
      coupon: newCoupon,
      stripeCli,
      org,
      prices,
    });

    console.log("✅ Coupon successfully created in Stripe");
    const insertedCoupon = await CouponService.insert({
      sb: req.sb,
      data: newCoupon,
    });
    console.log("✅ Coupon successfully inserted into db");

    res.status(200).json(insertedCoupon);
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "create coupon",
    });
  }
});

couponRouter.delete("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { orgId, env } = req;
    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    await stripeCli.coupons.del(id);

    await CouponService.deleteStrict({
      sb: req.sb,
      internalId: id,
      env,
      orgId,
    });

    res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "delete coupon",
    });
  }
});

couponRouter.post("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { orgId, env } = req;
    const couponBody = req.body;

    console.log("Coupon body", couponBody);
    const org = await OrgService.getFromReq(req);
    const stripeCli = createStripeCli({
      org,
      env,
    });

    const prices = await PriceService.getPricesFromIds({
      sb: req.sb,
      priceIds: couponBody.price_ids,
    });

    // 1. Delete old prices from stripe
    await stripeCli.coupons.del(id);

    // 2. Create new coupon
    await createStripeCoupon({
      coupon: couponBody,
      stripeCli,
      org,
      prices,
    });

    // 3. Update coupon in db
    const updatedCoupon = await CouponService.update({
      sb: req.sb,
      internalId: id,
      env,
      orgId,
      update: couponBody,
    });

    res.status(200).json(updatedCoupon);
  } catch (error) {
    handleRequestError({
      error,
      res,
      req,
      action: "update coupon",
    });
  }
});

export default couponRouter;
