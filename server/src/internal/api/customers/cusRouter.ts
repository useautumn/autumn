import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";

import { APIVersion } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { ErrorMessages } from "@/errors/errMessages.js";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../../customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { createStripeCli } from "@/external/stripe/utils.js";
import { handleDeleteCustomer } from "./handlers/cusDeleteHandlers.js";
import { handleUpdateBalances } from "./handlers/handleUpdateBalances.js";
import { handleUpdateEntitlement } from "./handlers/handleUpdateEntitlement.js";
import { handleCusProductExpired } from "./handlers/handleCusProductExpired.js";
import { handleAddCouponToCus } from "./handlers/handleAddCouponToCus.js";
import { handlePostCustomerRequest } from "./handlers/handleCreateCustomer.js";
import { entityRouter } from "../entities/entityRouter.js";
import { handleUpdateCustomer } from "./handlers/handleUpdateCustomer.js";
import { handleCreateBillingPortal } from "./handlers/handleCreateBillingPortal.js";
import { handleGetCustomer } from "./handlers/handleGetCustomer.js";

export const cusRouter = Router();

cusRouter.post("/all/search", async (req: any, res: any) => {
  try {
    const { search, page_size = 50, page = 1, last_item, filters } = req.body;

    const { data: customers, count } = await CusService.searchCustomers({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      search,
      filters,
      lastItem: last_item,
      pg: req.pg,
      pageNumber: page,
      pageSize: page_size,
    });

    res.status(200).json({ customers, totalCount: count });
  } catch (error) {
    handleRequestError({ req, error, res, action: "search customers" });
  }
});

cusRouter.post("", handlePostCustomerRequest);

// BY CUSTOMER ID

cusRouter.get("/:customer_id", handleGetCustomer);

cusRouter.delete("/:customer_id", handleDeleteCustomer);

cusRouter.post("/:customer_id", handleUpdateCustomer);

// Update customer entitlement directly
cusRouter.post(
  "/customer_entitlements/:customer_entitlement_id",
  handleUpdateEntitlement,
);

cusRouter.post("/:customer_id/balances", handleUpdateBalances);

cusRouter.post(
  "/customer_products/:customer_product_id",
  handleCusProductExpired,
);

cusRouter.get("/:customer_id/billing_portal", async (req: any, res: any) => {
  try {
    let returnUrl = req.query.return_url;

    const customerId = req.params.customer_id;

    const [org, customer] = await Promise.all([
      OrgService.getFromReq(req),
      CusService.get({
        db: req.db,
        idOrInternalId: customerId,
        orgId: req.orgId,
        env: req.env,
      }),
    ]);

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (!customer.processor?.id) {
      throw new RecaseError({
        message: `Customer ${customerId} not connected to Stripe`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    const stripeCli = createStripeCli({ org, env: req.env });
    const portal = await stripeCli.billingPortal.sessions.create({
      customer: customer.processor.id,
      return_url: returnUrl || org.stripe_config?.success_url,
    });

    if (org.api_version >= APIVersion.v1_1) {
      res.status(200).json({
        customer_id: customer.id,
        url: portal.url,
      });
    } else {
      res.status(200).json({
        url: portal.url,
      });
    }
  } catch (error) {
    handleRequestError({ req, error, res, action: "get billing portal" });
  }
});

cusRouter.post("/:customer_id/billing_portal", handleCreateBillingPortal);

cusRouter.post("/:customer_id/coupons/:coupon_id", handleAddCouponToCus);

cusRouter.use("/:customer_id/entities", entityRouter);
