import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";

import { CreateCustomerSchema, CustomerResponseSchema } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { ErrorMessages } from "@/errors/errMessages.js";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../../customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getCustomerDetails } from "./cusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { deleteCusById } from "./handlers/cusDeleteHandlers.js";
import { handleUpdateBalances } from "./handlers/handleUpdateBalances.js";
import { handleUpdateEntitlement } from "./handlers/handleUpdateEntitlement.js";
import { handleCusProductExpired } from "./handlers/handleCusProductExpired.js";
import { handleAddCouponToCus } from "./handlers/handleAddCouponToCus.js";
import { handlePostCustomerRequest } from "./handlers/handleCreateCustomer.js";
import { notNullish } from "@/utils/genUtils.js";
import { entityRouter } from "../entities/entityRouter.js";

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

cusRouter.get("", async (req: any, res: any) => {
  try {
    const customers = await CusService.getCustomers(req.sb, req.orgId, req.env);

    res.status(200).json({ customers });
  } catch (error) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: ErrorMessages.InternalError });
  }
});

cusRouter.post("", handlePostCustomerRequest);

// BY CUSTOMER ID

cusRouter.get("/:customer_id", async (req: any, res: any) => {
  try {
    let customerId = req.params.customer_id;
    let customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
      logger: req.logtail,
    });

    if (!customer) {
      req.logtail.warn(
        `GET /customers/${customerId}: not found | Org: ${req.minOrg.slug}`
      );
      res.status(StatusCodes.NOT_FOUND).json({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
      });
      return;
    }

    // const { main, addOns, balances, invoices } =
    let cusData = await getCustomerDetails({
      customer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      // params: req.query,
      logger: req.logtail,
    });

    res.status(200).json(cusData);
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer" });
  }
});

cusRouter.delete("/:customer_id", async (req: any, res: any) => {
  try {
    const data = await deleteCusById({
      sb: req.sb,
      minOrg: req.minOrg,
      customerId: req.params.customer_id,
      env: req.env,
      logger: req.logtail,
      deleteInStripe: req.query.delete_in_stripe === "true",
    });

    res.status(200).json(data);
  } catch (error) {
    handleRequestError({ req, error, res, action: "delete customer" });
  }
});

cusRouter.post("/:customer_id", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    const [originalCustomer, org] = await Promise.all([
      CusService.getByIdOrInternalId({
        sb: req.sb,
        idOrInternalId: customerId,
        orgId: req.orgId,
        env: req.env,
      }),
      OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId }),
    ]);

    if (!originalCustomer) {
      throw new RecaseError({
        message: `Update customer: Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    let newCusData: any = CreateCustomerSchema.parse(req.body);

    if (notNullish(newCusData.id) && originalCustomer.id !== newCusData.id) {
      // Fetch for existing customer
      const existingCustomer = await CusService.getById({
        sb: req.sb,
        id: newCusData.id,
        orgId: req.orgId,
        env: req.env,
        logger: req.logtail,
      });

      if (existingCustomer) {
        throw new RecaseError({
          message: `Update customer: Customer ${newCusData.id} already exists, can't change to this ID`,
          code: ErrCode.DuplicateCustomerId,
          statusCode: StatusCodes.CONFLICT,
        });
      }
    } else {
      delete newCusData.id;
    }

    // 2. Check if customer email is being changed
    let stripeUpdate = {
      email:
        originalCustomer.email !== newCusData.email
          ? newCusData.email
          : undefined,
      name:
        originalCustomer.name !== newCusData.name ? newCusData.name : undefined,
    };

    if (
      Object.keys(stripeUpdate).length > 0 &&
      originalCustomer.processor?.id
    ) {
      const stripeCli = createStripeCli({ org, env: req.env });
      await stripeCli.customers.update(
        originalCustomer.processor.id,
        stripeUpdate as any
      );
    }

    const updatedCustomer = await CusService.update({
      sb: req.sb,
      internalCusId: originalCustomer.internal_id,
      update: newCusData,
    });

    res.status(200).json({ customer: updatedCustomer });
  } catch (error) {
    handleRequestError({ req, error, res, action: "update customer" });
  }
});

// Update customer entitlement directly
cusRouter.post(
  "/customer_entitlements/:customer_entitlement_id",
  handleUpdateEntitlement
);

cusRouter.post("/:customer_id/balances", handleUpdateBalances);

cusRouter.post(
  "/customer_products/:customer_product_id",
  handleCusProductExpired
);

cusRouter.get("/:customer_id/billing_portal", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    const customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
      logger: req.logtail,
    });

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

    const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });

    const stripeCli = createStripeCli({ org, env: req.env });
    const portal = await stripeCli.billingPortal.sessions.create({
      customer: customer.processor.id,
      return_url: org.stripe_config.success_url,
    });

    res.status(200).json({
      url: portal.url,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get billing portal" });
  }
});

// Entitlements
// cusRouter.get("/:customer_id/entitlements", async (req: any, res: any) => {
//   const customerId = req.params.customer_id;

//   let balances: any[] = [];
//   const customer = await CusService.getById({
//     sb: req.sb,
//     id: customerId,
//     orgId: req.orgId,
//     env: req.env,
//     logger: req.logtail,
//   });

//   const fullCusProducts = await CusService.getFullCusProducts({
//     sb: req.sb,
//     internalCustomerId: customer.internal_id,
//     withPrices: true,
//     logger: req.logtail,
//   });

//   const cusEntsWithCusProduct = fullCusProductToCusEnts(fullCusProducts);
//   const cusPrices = fullCusProductToCusPrices(fullCusProducts);

//   balances = await getCusBalancesByEntitlement({
//     cusEntsWithCusProduct: cusEntsWithCusProduct as any,
//     cusPrices,
//     entities,
//   });

//   for (const balance of balances) {
//     if (balance.total && balance.balance) {
//       balance.used = balance.total - balance.balance;
//       delete balance.total;
//     }
//   }

//   res.status(200).json(balances);
// });

// Invoice

cusRouter.post("/:customer_id/coupons/:coupon_id", handleAddCouponToCus);

cusRouter.use("/:customer_id/entities", entityRouter);

// cusRouter.put("", async (req: any, res: any) => {
//   try {
//     const { id, name, email, fingerprint, reset_at } = req.body;

//     if (!id && !email) {
//       throw new RecaseError({
//         message: "Customer ID or email is required",
//         code: ErrCode.InvalidCustomer,
//         statusCode: StatusCodes.BAD_REQUEST,
//       });
//     }

//     let existingCustomers = await CusService.getByIdOrEmail({
//       sb: req.sb,
//       id,
//       email,
//       orgId: req.orgId,
//       env: req.env,
//     });

//     if (existingCustomers.length > 1) {
//       throw new RecaseError({
//         message: "Multiple customers found",
//         code: ErrCode.MultipleCustomersFound,
//         statusCode: StatusCodes.CONFLICT,
//       });
//     }

//     let newCustomer: Customer;
//     if (existingCustomers.length == 1) {
//       const existing = existingCustomers[0];
//       newCustomer = await CusService.update({
//         sb: req.sb,
//         internalCusId: existing.internal_id,
//         update: { id, name, email, fingerprint },
//       });
//     } else {
//       newCustomer = await createNewCustomer({
//         sb: req.sb,
//         orgId: req.orgId,
//         env: req.env,
//         customer: {
//           id,
//           name: name || "",
//           email: email || "",
//           fingerprint,
//         },
//         nextResetAt: reset_at,
//         logger: req.logtail,
//       });
//     }

//     res.status(200).json({
//       customer: CustomerResponseSchema.parse(newCustomer),
//       success: true,
//       action: existingCustomers.length == 1 ? "update" : "create",
//     });
//   } catch (error) {
//     handleRequestError({ req, error, res, action: "update customer" });
//   }
// });
