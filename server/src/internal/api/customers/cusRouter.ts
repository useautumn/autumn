import { ErrCode } from "@/errors/errCodes.js";
import { ErrorMessages } from "@/errors/errMessages.js";

import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import {
  AppEnv,
  CreateCustomer,
  CreateCustomerSchema,
  Customer,
  CustomerResponseSchema,
  ProcessorType,
} from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../../customers/CusService.js";
import {
  createStripeCustomer,
  deleteStripeCustomer,
} from "@/external/stripe/stripeCusUtils.js";
import Stripe from "stripe";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { EventService } from "../events/EventService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const cusRouter = Router();

const createNewCustomer = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
}) => {
  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const customerData: Customer = {
    ...customer,
    internal_id: generateId("cus"),
    org_id: orgId,
    created_at: Date.now(),
    env,
  };

  let stripeCustomer: Stripe.Customer | undefined;
  if (org.stripe_connected) {
    stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer: customerData,
    });
    customerData.processor = {
      type: ProcessorType.Stripe,
      id: stripeCustomer?.id,
    };
  }

  const newCustomer = await CusService.createCustomer({
    sb,
    customer: customerData,
  });

  // Attach default product to customer
  const defaultProds = await ProductService.getFullDefaultProduct({
    sb,
    orgId,
    env,
  });

  for (const product of defaultProds) {
    await createFullCusProduct({
      sb,
      attachParams: {
        org,
        customer: newCustomer,
        product,
        prices: product.prices,
        entitlements: product.entitlements,
        freeTrial: null, // TODO: Free trial not supported on default product yet
        optionsList: [],
      },
      nextResetAt,
    });
  }

  return newCustomer;
};

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

    res.status(200).json({
      customer: CustomerResponseSchema.parse(createdCustomer),
      success: true,
    });
  } catch (error: any) {
    handleRequestError({ error, res, action: "create customer" });
  }
});

cusRouter.get("", async (req: any, res: any) => {
  try {
    const customers = await CusService.getCustomers(
      req.sb,
      req.org.id,
      req.env
    );

    res.status(200).send({ customers });
  } catch (error) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: ErrorMessages.InternalError });
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
      console.log("Error deleting stripe customer", error?.message || error);
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
      org: req.org,
      env: req.env,
    });

    res.status(200).json({ events });
  } catch (error) {
    handleRequestError({ error, res, action: "get customer events" });
  }
});

cusRouter.put("", async (req: any, res: any) => {
  try {
    const { id, name, email, fingerprint, next_reset_at } = req.body;

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

    console.log("existing", existing);
    console.log("Request header:", req.headers.authorization);
    console.log("Org ID:", req.orgId);

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
          name,
          email,
          fingerprint,
        },
        nextResetAt: next_reset_at,
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
