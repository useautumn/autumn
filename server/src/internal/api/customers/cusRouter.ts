import {
  AppEnv,
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
import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { EventService } from "../events/EventService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createNewCustomer } from "./cusUtils.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getCusBalancesByEntitlement,
  getCusBalancesByProduct,
  sortCusEntsForDeduction,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { processFullCusProduct } from "@/internal/customers/products/cusProductUtils.js";
import {
  InvoiceService,
  processInvoice,
} from "@/internal/customers/invoices/InvoiceService.js";
import { SupabaseClient } from "@supabase/supabase-js";

export const cusRouter = Router();

const notNullOrUndefined = (value: any) => {
  return value !== null && value !== undefined;
};

export const getCustomerDetails = async ({
  customer,
  sb,
  orgId,
  env,
}: {
  customer: Customer;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
}) => {
  const cusProducts = await CusProductService.getFullByCustomerId({
    sb,
    customerId: customer.id,
    orgId,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
  });

  let main = [];
  let addOns = [];

  for (const cusProduct of cusProducts) {
    let processed = processFullCusProduct(cusProduct);

    let isAddOn = cusProduct.product.is_add_on;
    if (isAddOn) {
      addOns.push(processed);
    } else {
      main.push(processed);
    }
  }

  // Get entitlements
  const balances = await getCusBalancesByEntitlement({
    sb,
    customerId: customer.id,
    orgId,
    env,
  });

  for (const balance of balances) {
    if (
      notNullOrUndefined(balance.total) &&
      notNullOrUndefined(balance.balance)
    ) {
      balance.used = balance.total - balance.balance;
      delete balance.total;
    }
  }

  // Get customer invoices
  const invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId: customer.internal_id,
  });

  const processedInvoices = invoices.map(processInvoice);

  return {
    customer,
    main,
    addOns,
    balances,
    invoices: processedInvoices,
  };
};

cusRouter.post("/:search", async (req: any, res: any) => {
  try {
    const {
      search,
      page_size = 100,
      // page = 1,
      last_item,
      first_item,
    } = req.body;

    const { data: customers, count } = await CusService.searchCustomers({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      search,
      page: null,
      pageSize: page_size,
      filters: {},
      lastItem: last_item,
      firstItem: first_item,
    });

    res
      .status(200)
      .json({ customers, totalCount: count, count: customers.length });
  } catch (error) {
    handleRequestError({ error, res, action: "search customers" });
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
    const existingCustomer = await CusService.getCustomer({
      sb: req.sb,
      orgId: req.orgId,
      customerId: data.id,
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
    handleRequestError({ error, res, action: "create customer" });
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
    handleRequestError({ error, res, action: "update customer" });
  }
});

cusRouter.delete("/:customerId", async (req: any, res: any) => {
  try {
    const customerId = req.params.customerId;
    let orgId = req.orgId;
    const fullOrg = await OrgService.getFullOrg({
      sb: req.sb,
      orgId,
    });

    const customer = await CusService.getCustomer({
      sb: req.sb,
      orgId,
      env: req.env,
      customerId,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    try {
      await deleteStripeCustomer({
        org: fullOrg,
        env: req.env,
        stripeId: customer.processor.id,
      });
    } catch (error: any) {
      console.log("Couldn't delete stripe customer", error?.message || error);
    }

    await CusService.deleteCustomerStrict({
      sb: req.sb,
      customerId,
      orgId,
      env: req.env,
    });

    res.status(200).json({ success: true, customer_id: customerId });
  } catch (error) {
    handleRequestError({ error, res, action: "delete customer" });
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
    handleRequestError({ error, res, action: "get customer events" });
  }
});

cusRouter.post(
  "/customer_entitlements/:customer_entitlement_id",
  async (req: any, res: any) => {
    try {
      const { customer_entitlement_id } = req.params;
      const { balance, next_reset_at } = req.body;

      if (!Number.isInteger(balance) || balance < 0) {
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
      await CustomerEntitlementService.getByIdStrict({
        sb: req.sb,
        id: customer_entitlement_id,
        orgId: req.orgId,
        env: req.env,
      });

      await CustomerEntitlementService.update({
        sb: req.sb,
        id: customer_entitlement_id,
        updates: { balance, next_reset_at },
      });

      res.status(200).json({ success: true });
    } catch (error) {
      handleRequestError({ error, res, action: "update customer entitlement" });
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

    const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
      sb: req.sb,
      internalCustomerId: customer.internal_id,
      internalFeatureIds: featuresToUpdate.map((f) => f.internal_id),
    });

    sortCusEntsForDeduction(cusEnts);

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
          curBalance += cusEnt.balance;
        }
      }

      let updateAmount = newBalance - curBalance;

      for (const cusEnt of cusEnts) {
        if (updateAmount == 0) break;
        if (cusEnt.internal_feature_id === feature.internal_id) {
          if (cusEnt.balance + updateAmount < 0) {
            updateAmount += cusEnt.balance;
            newBalance = 0;
          } else {
            newBalance = cusEnt.balance + updateAmount;
            updateAmount = 0;
          }

          await CustomerEntitlementService.update({
            sb: req.sb,
            id: cusEnt.id,
            updates: {
              balance: newBalance,
            },
          });
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    handleRequestError({ error, res, action: "update customer balances" });
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
    handleRequestError({ error, res, action: "get customer" });
  }
});

cusRouter.get("/:customer_id/billing_portal", async (req: any, res: any) => {
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

  if (!customer.processor.id) {
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
});

// Entitlements
cusRouter.get("/:customer_id/entitlements", async (req: any, res: any) => {
  const customerId = req.params.customer_id;
  const group_by = req.query.group_by;

  let balances: any[] = [];
  if (group_by == "product") {
    balances = await getCusBalancesByProduct({
      sb: req.sb,
      customerId,
      orgId: req.orgId,
      env: req.env,
    });
  } else {
    balances = await getCusBalancesByEntitlement({
      sb: req.sb,
      customerId,
      orgId: req.orgId,
      env: req.env,
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

// cusRouter.get("/:customer_id/products", async (req: any, res: any) => {
//   const customerId = req.params.customer_id;

//   const cusProducts = await CusProductService.getByCustomerId({
//     sb: req.sb,
//     customerId,
//     inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
//   });

//   // Clean up:
//   let products = [];
//   for (const cusProduct of cusProducts) {
//     products.push({
//       id: cusProduct.product.id,
//       name: cusProduct.product.name,
//       group: cusProduct.product.group,
//       status: cusProduct.status,
//       created_at: cusProduct.created_at,
//       canceled_at: cusProduct.canceled_at,
//       processor: {
//         type: cusProduct.processor.type,
//         subscription_id: cusProduct.processor.subscription_id || null,
//       },
//     });
//   }

//   res.status(200).json(products);
// });
