import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CouponService } from "@/internal/coupons/CouponService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";

export const handleAddCouponToCus = async (req: any, res: any) => {
  try {
    const { customer_id, coupon_id } = req.params;
    const { orgId, env, sb, logtail: logger } = req;

    const [org, customer, coupon] = await Promise.all([
      OrgService.getFromReq(req),
      CusService.getById({
        sb: req.sb,
        id: customer_id,
        orgId: req.orgId,
        env: req.env,
      }),

      CouponService.getByInternalId({
        sb: req.sb,
        internalId: coupon_id,
        orgId: req.orgId,
        env: req.env,
      }),
    ]);

    const stripeCli = createStripeCli({ org, env });

    await createStripeCusIfNotExists({
      sb,
      org,
      env,
      customer,
      logger,
    });

    // Attach coupon to customer
    await stripeCli.customers.update(customer.processor.id, {
      coupon: coupon.internal_id,
    });

    res.status(200).json({ customer, coupon });
  } catch (error) {
    handleRequestError({ req, error, res, action: "add coupon to customer" });
  }
};
