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

    const stripeCli = createStripeCli({
      org,
      env,
      // apiVersion: "2025-02-24.acacia",
      legacyVersion: true,
    });

    await createStripeCusIfNotExists({
      db,
      org,
      env,
      customer,
      logger,
    });

    // Attach coupon to customer
    //   curl https://api.stripe.com/v1/customers/cus_123456/discounts \
    // -u sk_test_your_key: \
    // -d coupon=COUPON_ID

    await stripeCli.rawRequest(
      "POST",
      `/v1/customers/${customer.processor.id}`,
      {
        coupon: coupon.id,
      }
    );
    // await stripeCli.customers.update(customer.processor.id, {
    // coupon: coupon.id,

    // discounts: [{ coupon: coupon.id }],
    // });

    res.status(200).json({ customer, coupon });
  } catch (error) {
    handleRequestError({ req, error, res, action: "add coupon to customer" });
  }
};

export const handleGetCustomerCoupon = async (req: any, res: any) => {
  try {
    const { customer_id } = req.params;
    const { db, orgId, env } = req;

    const customer = await CusService.get({
      db,
      idOrInternalId: customer_id,
      orgId,
      env,
    });

    if (!customer?.processor?.id) {
      return res.status(404).json({ error: "Customer not found in Stripe" });
    }

    const stripeCli = createStripeCli({ org: req.org, env });
    const stripeCustomer = await stripeCli.customers.retrieve(
      customer.processor.id,
      { expand: ["discount.coupon"] }
    );

    res.json({
      coupon: stripeCustomer,
    });
  } catch (error) {
    handleRequestError({
      req,
      res,
      error,
      action: "get customer coupon",
    });
  }
};
