import { ErrCode } from "@/errors/errCodes.js";
import { ErrorMessages } from "@/errors/errMessages.js";

import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { CreateCustomerSchema, Customer, ProcessorType } from "@autumn/shared";
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

export const cusRouter = Router();

cusRouter.post("", async (req: any, res: any) => {
  try {
    const data = req.body;
    const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });

    // 1. Validate data
    try {
      CreateCustomerSchema.parse(data);
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid customer data, error: " + formatZodError(error),
        code: ErrCode.InvalidCustomer,
        statusCode: StatusCodes.BAD_REQUEST,
        data: error,
      });
    }

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

    // 3. Create stripe customer
    let stripeCustomer: Stripe.Customer | undefined;
    if (org.stripe_connected) {
      stripeCustomer = await createStripeCustomer({
        org,
        env: req.env,
        customer: data,
      });
    }

    // 4. Create customer in db
    const newCustomer: Customer = {
      ...data,
      internal_id: generateId("cus"),
      org_id: req.orgId,
      created_at: Date.now(),
      env: req.env,

      processor: stripeCustomer && {
        type: ProcessorType.Stripe,
        id: stripeCustomer.id,
      },
    };

    let createdCustomer: Customer;
    try {
      createdCustomer = await CusService.createCustomer(req.sb, newCustomer);
    } catch (error: any) {
      throw new RecaseError({
        message: "Error creating customer",
        code: ErrCode.CreateCustomerFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    // 5. Attach default product to customer
    try {
      const defaultProduct = await ProductService.getFullDefaultProduct({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
      });

      if (defaultProduct) {
        await createFullCusProduct({
          sb: req.sb,
          customer: createdCustomer,
          product: defaultProduct,
          prices: defaultProduct.prices,
          entitlements: defaultProduct.entitlements,
          optionsList: [],
        });
      }
    } catch (error) {
      throw new RecaseError({
        message: "Error attaching default product to customer",
        code: ErrCode.AttachProductToCustomerFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    res.status(200).json({ customer: createdCustomer, success: true });
  } catch (error: any) {
    if (error instanceof RecaseError) {
      error.print();
      res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code });
      return;
    }

    console.log("Unknown error creating customer", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: ErrorMessages.InternalError,
      code: ErrCode.InternalError,
    });
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

  try {
    await deleteStripeCustomer({
      org: fullOrg,
      env: req.env,
      stripeId: customer.processor.id,
    });
  } catch (error: any) {
    console.log("Error deleting stripe customer", error?.message || error);
  }

  try {
    await CusService.deleteCustomerStrict({
      sb: req.sb,
      customerId,
      orgId,
      env: req.env,
    });

    res.status(200).json({ success: true, customer_id: customerId });
  } catch (error) {
    console.log("Error deleting customer", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: ErrorMessages.InternalError,
      code: ErrCode.InternalError,
    });
  }
});

// cusRouter.use("/:customer_id/products", cusProductApiRouter);
