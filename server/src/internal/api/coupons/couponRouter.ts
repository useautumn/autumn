import express from "express";
import { CouponDurationType, CreateCouponSchema } from "@autumn/shared";
import { handleRequestError } from "@/utils/errorUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { initCoupon } from "@/internal/coupons/couponUtils.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils.js";
import { CouponService } from "@/internal/coupons/CouponService.js";
import { PriceService } from "@/internal/prices/PriceService.js";
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
    });

    const stripeCli = createStripeCli({
      org,
      env,
    });

    // Get prices for coupon
    const prices = await PriceService.getPricesFromIds({
      sb: req.sb,
      priceIds: newCoupon.price_ids,
    });

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

export default couponRouter;
