import {
  CreateCustomerSchema,
  CusProductStatus,
  Customer,
  CustomerResponseSchema,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { ErrorMessages } from "@/errors/errMessages.js";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../../customers/CusService.js";

import { OrgService } from "@/internal/orgs/OrgService.js";
import { EventService } from "../events/EventService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import {
  createNewCustomer,
  getCusEntsInFeatures,
  getCustomerDetails,
} from "./cusUtils.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getCusBalancesByEntitlement,
  getCusBalancesByProduct,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import {
  cancelCusProductSubscriptions,
  expireAndActivate,
  fullCusProductToCusEnts,
  fullCusProductToCusPrices,
  uncancelCurrentProduct,
} from "@/internal/customers/products/cusProductUtils.js";
import { deleteCusById } from "./handlers/cusDeleteHandlers.js";

export const cusRouter = Router();

cusRouter.post("/:search", async (req: any, res: any) => {
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

    res.status(200).send({ customers });
  } catch (error) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: ErrorMessages.InternalError });
  }
});

cusRouter.post("", async (req: any, res: any) => {
  try {
    const data = req.body;

    // 1. Validate data
    CreateCustomerSchema.parse(data);

    // 2. Check if customer ID already exists
    const existingCustomer = await CusService.getById({
      sb: req.sb,
      id: data.id,
      orgId: req.orgId,
      env: req.env,
    });

    if (existingCustomer) {
      throw new RecaseError({
        message: `Customer ${existingCustomer.id} already exists`,
        code: ErrCode.DuplicateCustomerId,
        statusCode: StatusCodes.CONFLICT,
      });
    }

    const createdCustomer = await createNewCustomer({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      customer: data,
    });

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer: createdCustomer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
    });

    res.status(200).json({
      customer: CustomerResponseSchema.parse(createdCustomer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices,
      success: true,
    });
  } catch (error: any) {
    handleRequestError({ req, error, res, action: "create customer" });
  }
});

cusRouter.put("", async (req: any, res: any) => {
  try {
    const { id, name, email, fingerprint, reset_at } = req.body;

    if (!id && !email) {
      throw new RecaseError({
        message: "Customer ID or email is required",
        code: ErrCode.InvalidCustomer,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    let existing = await CusService.getByIdOrEmail({
      sb: req.sb,
      id,
      email,
      orgId: req.orgId,
      env: req.env,
    });

    let newCustomer: Customer;
    if (existing) {
      newCustomer = await CusService.update({
        sb: req.sb,
        internalCusId: existing.internal_id,
        update: { id, name, email, fingerprint },
      });
    } else {
      newCustomer = await createNewCustomer({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
        customer: {
          id,
          name: name || "",
          email: email || "",
          fingerprint,
        },
        nextResetAt: reset_at,
      });
    }

    res.status(200).json({
      customer: CustomerResponseSchema.parse(newCustomer),
      success: true,
      action: existing ? "update" : "create",
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "update customer" });
  }
});

cusRouter.delete("/:customer_id", async (req: any, res: any) => {
  try {
    const data = await deleteCusById({
      sb: req.sb,
      minOrg: req.minOrg,
      customerId: req.params.customer_id,
      env: req.env,
    });

    res.status(200).json(data);
  } catch (error) {
    handleRequestError({ req, error, res, action: "delete customer" });
  }
});

cusRouter.get("/:customer_id/events", async (req: any, res: any) => {
  const customerId = req.params.customer_id;
  try {
    const events = await EventService.getByCustomerId({
      sb: req.sb,
      customerId,
      orgId: req.orgId,
      env: req.env,
    });

    res.status(200).json({ events });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer events" });
  }
});

// Update customer entitlement directly
cusRouter.post(
  "/customer_entitlements/:customer_entitlement_id",
  async (req: any, res: any) => {
    try {
      const { customer_entitlement_id } = req.params;
      const { balance, next_reset_at } = req.body;

      if (!Number.isInteger(balance)) {
        throw new RecaseError({
          message: "Balance must be a positive integer",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (
        next_reset_at !== null &&
        (!Number.isInteger(next_reset_at) || next_reset_at < 0)
      ) {
        throw new RecaseError({
          message: "Next reset at must be a valid unix timestamp or null",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // Check if org owns the entitlement
      const cusEnt = await CustomerEntitlementService.getByIdStrict({
        sb: req.sb,
        id: customer_entitlement_id,
        orgId: req.orgId,
        env: req.env,
      });

      if (balance < 0 && !cusEnt.usage_allowed) {
        throw new RecaseError({
          message: "Entitlement does not allow usage",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      const amountUsed = cusEnt.balance! - balance;
      const adjustment = cusEnt.adjustment! - amountUsed;

      await CustomerEntitlementService.update({
        sb: req.sb,
        id: customer_entitlement_id,
        updates: { balance, next_reset_at, adjustment },
      });

      res.status(200).json({ success: true });
    } catch (error) {
      handleRequestError({
        req,
        error,
        res,
        action: "update customer entitlement",
      });
    }
  }
);

cusRouter.post("/:customer_id/balances", async (req: any, res: any) => {
  try {
    const cusId = req.params.customer_id;
    const { balances } = req.body;

    const customer = await CusService.getById({
      sb: req.sb,
      id: cusId,
      orgId: req.orgId,
      env: req.env,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${cusId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const features = await FeatureService.getFromReq(req);
    const featuresToUpdate = features.filter((f) =>
      balances.map((b: any) => b.feature_id).includes(f.id)
    );

    const { cusEnts } = await getCusEntsInFeatures({
      sb: req.sb,
      internalCustomerId: customer.internal_id,
      internalFeatureIds: featuresToUpdate.map((f) => f.internal_id),
    });

    // console.log("cusEnts", cusEnts);
    for (const balance of balances) {
      if (!balance.feature_id) {
        throw new RecaseError({
          message: "Feature ID is required",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (typeof balance.balance !== "number") {
        throw new RecaseError({
          message: "Balance must be a number",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      const feature = featuresToUpdate.find((f) => f.id === balance.feature_id);
      // const cusEntToUpdate = cusEnts.find((e) => e.feature_id === feature.id);

      // How much to update
      let curBalance = 0;
      let newBalance = balance.balance;
      for (const cusEnt of cusEnts) {
        if (cusEnt.internal_feature_id === feature.internal_id) {
          curBalance += cusEnt.balance!;
        }
      }

      let toDeduct = curBalance - newBalance;

      for (const cusEnt of cusEnts) {
        if (toDeduct == 0) break;
        if (cusEnt.internal_feature_id === feature.internal_id) {
          let amountUsed;
          if (cusEnt.balance! - toDeduct < 0) {
            toDeduct -= cusEnt.balance!;
            amountUsed = cusEnt.balance!;
            newBalance = 0;
          } else {
            newBalance = cusEnt.balance! - toDeduct;
            amountUsed = toDeduct;
            toDeduct = 0;
          }

          await CustomerEntitlementService.update({
            sb: req.sb,
            id: cusEnt.id,
            updates: {
              balance: newBalance,
              adjustment: cusEnt.adjustment! - amountUsed,
            },
          });
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    handleRequestError({ req, error, res, action: "update customer balances" });
  }
});

cusRouter.get("/:customer_id", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    const customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
    });

    res.status(200).json({
      customer: CustomerResponseSchema.parse(customer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer" });
  }
});

cusRouter.get("/:customer_id/billing_portal", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    const customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
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
cusRouter.get("/:customer_id/entitlements", async (req: any, res: any) => {
  const customerId = req.params.customer_id;
  const group_by = req.query.group_by;

  let balances: any[] = [];
  const customer = await CusService.getById({
    sb: req.sb,
    id: customerId,
    orgId: req.orgId,
    env: req.env,
  });

  const fullCusProducts = await CusService.getFullCusProducts({
    sb: req.sb,
    internalCustomerId: customer.internal_id,
    withPrices: true,
  });

  const cusEntsWithCusProduct = fullCusProductToCusEnts(fullCusProducts);
  const cusPrices = fullCusProductToCusPrices(fullCusProducts);

  if (group_by == "product") {
    balances = await getCusBalancesByProduct({
      sb: req.sb,
      customerId,
      orgId: req.orgId,
      env: req.env,
    });
  } else {
    balances = await getCusBalancesByEntitlement({
      cusEntsWithCusProduct: cusEntsWithCusProduct as any,
      cusPrices,
    });
  }

  for (const balance of balances) {
    if (balance.total && balance.balance) {
      balance.used = balance.total - balance.balance;
      delete balance.total;
    }
  }

  res.status(200).json(balances);
});

cusRouter.post(
  "/customer_products/:customer_product_id",
  async (req: any, res: any) => {
    const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });
    try {
      const customerProductId = req.params.customer_product_id;
      const { status } = req.body;

      // See if customer owns product
      const cusProduct = await CusProductService.getByIdStrict({
        sb: req.sb,
        id: customerProductId,
        orgId: req.orgId,
        env: req.env,
        withProduct: true,
      });

      if (status == cusProduct.status) {
        throw new RecaseError({
          message: `Product ${cusProduct.product.name} already has status: ${status}`,
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // 1. If current product is scheduled:
      if (cusProduct.status == CusProductStatus.Scheduled) {
        await CusProductService.deleteFutureProduct({
          sb: req.sb,
          internalCustomerId: cusProduct.customer.internal_id,
          productGroup: cusProduct.product.group,
          org,
          env: req.env,
        });

        await uncancelCurrentProduct({
          sb: req.sb,
          internalCustomerId: cusProduct.customer.internal_id,
          productGroup: cusProduct.product.group,
          org,
          env: req.env,
        });
      } else {
        if (cusProduct.product.is_add_on) {
          await cancelCusProductSubscriptions({
            sb: req.sb,
            cusProduct,
            org,
            env: req.env,
          });

          await CusProductService.update({
            sb: req.sb,
            cusProductId: cusProduct.id,
            updates: {
              status: CusProductStatus.Expired,
              ended_at: Date.now(),
            },
          });

          res.status(200).json({ success: true });
          return;
        }
        const futureProduct = await CusProductService.getFutureProduct({
          sb: req.sb,
          internalCustomerId: cusProduct.customer.internal_id,
          productGroup: cusProduct.product.group,
        });

        if (futureProduct) {
          throw new RecaseError({
            message: `Please delete scheduled product ${futureProduct.product.name} first`,
            code: ErrCode.InvalidRequest,
            statusCode: StatusCodes.BAD_REQUEST,
          });
        }
        // For regular products
        // 1. Cancel stripe subscriptions
        const cancelled = await cancelCusProductSubscriptions({
          sb: req.sb,
          cusProduct,
          org,
          env: req.env,
        });

        if (!cancelled) {
          await expireAndActivate({
            sb: req.sb,
            env: req.env,
            cusProduct,
            org,
          });
        } // else will be handled by webhook
      }

      res.status(200).json({ success: true });
    } catch (error) {
      handleRequestError({
        req,
        error,
        res,
        action: "update customer product",
      });
    }
  }
);
