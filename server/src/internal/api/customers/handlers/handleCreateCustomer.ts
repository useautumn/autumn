import { handleRequestError } from "@/utils/errorUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  AttachScenario,
  BillingInterval,
  CreateCustomer,
  CreateCustomerSchema,
  CusProductStatus,
  Customer,
  ErrCode,
  FullProduct,
  Organization,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../getCustomerDetails.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  initProductInStripe,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { parseCusExpand } from "../cusUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const initStripeCusAndProducts = async ({
  db,
  sb,
  org,
  env,
  customer,
  products,
  logger,
}: {
  db: DrizzleCli;
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
        db,
        sb,
        org,
        env,
        logger,
        product,
      }),
    );
  }

  await Promise.all(batchInit);
};

export const createNewCustomer = async ({
  db,
  sb,
  org,
  env,
  customer,
  nextResetAt,
  processor,
  logger,
  createDefaultProducts = true,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
  processor?: any;
  logger: any;
  createDefaultProducts?: boolean;
}) => {
  logger.info(`Creating new customer: ${customer.id}`);
  logger.info(`Org ID: ${org.id}`);
  logger.info(`Customer data: ${JSON.stringify(customer)}`);

  const [defaultProds] = await Promise.all([
    ProductService.getFullDefaultProducts({
      sb,
      orgId: org.id,
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
      nonFreeProds.length > 0 && !parsedCustomer.email
        ? `${parsedCustomer.id}@invoices.useautumn.com`
        : parsedCustomer.email || "",

    internal_id: generateId("cus"),
    org_id: org.id,
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

  if (!createDefaultProducts) {
    return newCustomer;
  }

  if (nonFreeProds.length > 0) {
    await initStripeCusAndProducts({
      db,
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
        entities: [],
        features: [],
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
        entities: [],
        features: [],
      },
      nextResetAt,
      anchorToUnix: org.config.anchor_start_of_month
        ? getNextStartOfMonthUnix(BillingInterval.Month)
        : undefined,
      scenario: AttachScenario.New,
    });
  }

  return newCustomer;
};

const handleIdIsNull = async ({
  db,
  sb,
  org,
  env,
  newCus,
  logger,
  processor,
  createDefaultProducts,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  newCus: CreateCustomer;
  logger: any;
  processor?: any;
  createDefaultProducts?: boolean;
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
    sb,
    email: newCus.email,
    orgId: org.id,
    env,
  });

  if (existingCustomers.length > 0) {
    for (const existingCustomer of existingCustomers) {
      if (existingCustomer.id === null) {
        logger.info(
          `Create customer by email: ${newCus.email} already exists, skipping...`,
        );
        return existingCustomer;
      }
    }

    throw new RecaseError({
      message: `Email ${newCus.email} already exists`,
      code: ErrCode.DuplicateCustomerId,
      statusCode: StatusCodes.CONFLICT,
    });
  }

  const createdCustomer = await createNewCustomer({
    db,
    sb,
    org,
    env,
    customer: newCus,
    logger,
    processor,
    createDefaultProducts,
  });

  return createdCustomer;
};

// CAN ALSO USE DURING MIGRATION...
export const handleCreateCustomerWithId = async ({
  db,
  sb,
  org,
  env,
  logger,
  newCus,
  processor,
  createDefaultProducts = true,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  logger: any;
  newCus: CreateCustomer;
  processor?: any;
  createDefaultProducts?: boolean;
}) => {
  // 1. Get by ID
  let existingCustomer = await CusService.getById({
    sb,
    id: newCus.id!,
    orgId: org.id,
    env,
    logger,
  });

  if (existingCustomer) {
    logger.info(
      `POST /customers, existing customer found: ${existingCustomer.id} (org: ${org.slug})`,
    );
    return existingCustomer;
  }

  // 2. Check if email exists
  if (notNullish(newCus.email) && newCus.email !== "") {
    let cusWithEmail = await CusService.getByEmail({
      sb,
      email: newCus.email!,
      orgId: org.id,
      env,
    });

    if (cusWithEmail.length === 1 && cusWithEmail[0].id === null) {
      logger.info(
        `POST /customers, email ${newCus.email} and ID null found, updating ID to ${newCus.id} (org: ${org.slug})`,
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
    db,
    sb,
    org,
    env,
    customer: newCus,
    logger,
    processor,
    createDefaultProducts,
  });
};

export const handleCreateCustomer = async ({
  db,
  cusData,
  sb,
  org,
  env,
  logger,
  params = {},
  processor,
  getDetails = true,
  createDefaultProducts = true,
}: {
  db: DrizzleCli;
  cusData: CreateCustomer;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  logger: any;
  params?: any;
  processor?: any;
  getDetails?: boolean;
  createDefaultProducts?: boolean;
}) => {
  const newCus = CreateCustomerSchema.parse(cusData);

  // 1. If no ID and email is not NULL
  let createdCustomer;
  if (newCus.id === null) {
    createdCustomer = await handleIdIsNull({
      db,
      sb,
      org,
      env,
      newCus,
      logger,
      processor,
      createDefaultProducts,
    });
  } else {
    createdCustomer = await handleCreateCustomerWithId({
      db,
      sb,
      org,
      env,
      logger,
      newCus,
      processor,
      createDefaultProducts,
    });
  }

  return createdCustomer;
};

export const handlePostCustomerRequest = async (req: any, res: any) => {
  const logger = req.logtail;
  try {
    const { db, sb } = req;
    const data = req.body;
    const expand = parseCusExpand(req.query.expand);

    if (!data.id && !data.email) {
      throw new RecaseError({
        message: "ID or email is required",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    let org = await OrgService.getFromReq(req);
    let features = await FeatureService.getFromReq(req);
    let customer = await getOrCreateCustomer({
      db,
      sb,
      org,
      env: req.env,
      customerId: data.id,
      customerData: data,
      logger,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
      expand,

      features,
      entityId: data.entity_id,
      entityData: data.entity_data,
    });

    let cusDetails = await getCustomerDetails({
      customer,
      sb: req.sb,
      org,
      env: req.env,
      params: req.query,
      logger,
      cusProducts: customer.customer_products,
      expand,
      features,
      reqApiVersion: req.apiVersion,
    });

    res.status(200).json(cusDetails);
  } catch (error: any) {
    if (
      error instanceof RecaseError &&
      error.code === ErrCode.DuplicateCustomerId
    ) {
      logger.warn(
        `POST /customers: ${error.message} (org: ${req.minOrg.slug})`,
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
