import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleAddCouponToCus = async (req: any, res: any) => {
  try {
    const { customer_id, coupon_id } = req.params;
    const { db, orgId, env, logtail: logger } = req;

    const [org, customer, coupon] = await Promise.all([
      OrgService.getFromReq(req),
      CusService.get({
        db,
        idOrInternalId: customer_id,
        orgId,
        env,
      }),
      RewardService.get({
        db,
        idOrInternalId: coupon_id,
        orgId: req.orgId,
        env: req.env,
      }),
    ]);

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customer_id} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (!coupon) {
      throw new RecaseError({
        message: `Coupon ${coupon_id} not found`,
        code: ErrCode.RewardNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const stripeCli = createStripeCli({ org, env });

    await createStripeCusIfNotExists({
      db,
      org,
      env,
      customer,
      logger,
    });

    // Attach coupon to customer
    await stripeCli.customers.update(customer.processor.id, {
      coupon: coupon.id,
    });

    res.status(200).json({ customer, coupon });
  } catch (error) {
    handleRequestError({ req, error, res, action: "add coupon to customer" });
  }
};
