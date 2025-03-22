import { handleRequestError } from "@/utils/errorUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  BillingInterval,
  CreateCustomer,
  CreateCustomerSchema,
  Customer,
  CustomerResponseSchema,
  ErrCode,
  FullProduct,
  MinOrg,
  Organization,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../cusUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getNextStartOfMonthUnix } from "@/internal/prices/billingIntervalUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  initProductInStripe,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";

export const initStripeCusAndProducts = async ({
  sb,
  org,
  env,
  customer,
  products,
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  customer: Customer;
  products: FullProduct[];
  logger: any;
}) => {
  const batchInit = [
    createStripeCusIfNotExists({
      sb,
      org,
      env,
      customer,
      logger,
    }),
  ];

  for (const product of products) {
    batchInit.push(
      initProductInStripe({
        sb,
        org,
        env,
        logger,
        product,
      })
    );
  }

  await Promise.all(batchInit);
};

export const createNewCustomer = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
  processor,
  logger,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
  processor?: any;
  logger: any;
}) => {
  console.log("Creating new customer");
  console.log("Org ID:", orgId);
  console.log("Customer data:", customer);

  const [org, defaultProds] = await Promise.all([
    OrgService.getFullOrg({
      sb,
      orgId,
    }),
    ProductService.getFullDefaultProducts({
      sb,
      orgId,
      env,
    }),
  ]);

  const nonFreeProds = defaultProds.filter((p) => !isFreeProduct(p.prices));
  const freeProds = defaultProds.filter((p) => isFreeProduct(p.prices));

  const parsedCustomer = CreateCustomerSchema.parse(customer);

  const customerData: Customer = {
    ...parsedCustomer,
    name: parsedCustomer.name || "",
    email:
      parsedCustomer.email ||
      (nonFreeProds.length > 0
        ? `${parsedCustomer.id}@invoices.useautumn.com`
        : ""),

    internal_id: generateId("cus"),
    org_id: orgId,
    created_at: Date.now(),
    env,
    processor,
  };

  // Check if stripeCli exists
  if (nonFreeProds.length > 0) {
    createStripeCli({
      org,
      env,
    });

    if (!customerData?.email) {
      throw new RecaseError({
        code: ErrCode.InvalidRequest,
        message:
          "Customer email is required to attach default product with prices",
      });
    }
  }

  const newCustomer = await CusService.createCustomer({
    sb,
    customer: customerData,
  });

  if (nonFreeProds.length > 0) {
    // Create
    // <id>@invoices.useautumn.com

    await initStripeCusAndProducts({
      sb,
      org,
      env,
      customer: newCustomer,
      products: nonFreeProds,
      logger,
    });

    await handleAddProduct({
      req: {
        sb,
        logtail: logger,
      },
      res: {},
      attachParams: {
        org,
        customer: newCustomer,
        products: nonFreeProds,
        prices: nonFreeProds.flatMap((p) => p.prices),
        entitlements: nonFreeProds.flatMap((p) => p.entitlements),
        freeTrial: null,
        optionsList: [],
        cusProducts: [],
        invoiceOnly: true,
      },
      fromRequest: false,
    });
  }
  for (const product of freeProds) {
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
        cusProducts: [],
      },
      nextResetAt,
      anchorToUnix: org.config.anchor_start_of_month
        ? getNextStartOfMonthUnix(BillingInterval.Month)
        : undefined,
    });
  }

  return newCustomer;
};

const handleIdIsNull = async ({
  req,
  newCus,
}: {
  req: any;
  newCus: CreateCustomer;
}) => {
  // 1. ID is null
  if (!newCus.email) {
    throw new RecaseError({
      message: "Email is required when `id` is null",
      code: ErrCode.InvalidCustomer,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 2. Check if email already exists
  let existingCustomers = await CusService.getByEmail({
    sb: req.sb,
    email: newCus.email,
    orgId: req.orgId,
    env: req.env,
  });

  if (existingCustomers.length > 0) {
    throw new RecaseError({
      message: `Email ${newCus.email} already exists`,
      code: ErrCode.DuplicateCustomerId,
      statusCode: StatusCodes.CONFLICT,
    });
  }

  const createdCustomer = await createNewCustomer({
    sb: req.sb,
    orgId: req.orgId,
    env: req.env,
    customer: newCus,
    logger: req.logtail,
  });

  return createdCustomer;
};

// CAN ALSO USE DURING MIGRATION...
export const handleCreateCustomerWithId = async ({
  sb,
  orgId,
  orgSlug,
  env,
  logger,
  newCus,
  processor,
}: {
  sb: SupabaseClient;
  orgId: string;
  orgSlug: string;
  env: AppEnv;
  logger: any;
  newCus: CreateCustomer;
  processor?: any;
}) => {
  // 1. Get by ID
  let existingCustomer = await CusService.getById({
    sb,
    id: newCus.id!,
    orgId,
    env,
    logger,
  });

  if (existingCustomer) {
    console.log(
      `POST /customers, existing customer found: ${existingCustomer.id} (org: ${orgSlug})`
    );

    //
    return existingCustomer;
  }

  // 2. Check if email exists
  if (notNullish(newCus.email) && newCus.email !== "") {
    let cusWithEmail = await CusService.getByEmail({
      sb,
      email: newCus.email!,
      orgId,
      env,
    });

    if (cusWithEmail.length === 1 && cusWithEmail[0].id === null) {
      console.log(
        `POST /customers, email ${newCus.email} and ID null found, updating ID to ${newCus.id} (org: ${orgSlug})`
      );

      let updatedCustomer = await CusService.update({
        sb,
        internalCusId: cusWithEmail[0].internal_id,
        update: {
          id: newCus.id!,
          name: newCus.name,
          fingerprint: newCus.fingerprint,
        },
      });

      return updatedCustomer;
    }
  }

  // 2. Handle email step...
  return await createNewCustomer({
    sb,
    orgId,
    env,
    customer: newCus,
    logger,
    processor,
  });
};

export const handleCreateCustomer = async (req: any, res: any) => {
  const logger = req.logtail;
  try {
    const data = req.body;

    const newCus = CreateCustomerSchema.parse(data);

    // 1. If no ID and email is not NULL
    let createdCustomer;
    if (newCus.id === null) {
      createdCustomer = await handleIdIsNull({ req, newCus });
    } else {
      createdCustomer = await handleCreateCustomerWithId({
        sb: req.sb,
        orgId: req.orgId,
        orgSlug: req.minOrg.slug,
        env: req.env,
        logger,
        newCus,
      });
    }

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer: createdCustomer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      params: req.query,
      logger,
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
    if (
      error instanceof RecaseError &&
      error.code === ErrCode.DuplicateCustomerId
    ) {
      logger.warn(
        `POST /customers: ${error.message} (org: ${req.minOrg.slug})`
      );
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }
    handleRequestError({ req, error, res, action: "create customer" });
  }
};
