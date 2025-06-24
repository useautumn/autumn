import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  CreateCustomer,
  CreateCustomerSchema,
  Customer,
  ErrCode,
  FullProduct,
  Organization,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { notNullish } from "@/utils/genUtils.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createNewCustomer } from "../cusUtils/createNewCustomer.js";

export const initStripeCusAndProducts = async ({
  db,
  org,
  env,
  customer,
  products,
  logger,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  customer: Customer;
  products: FullProduct[];
  logger: any;
}) => {
  const batchInit: any[] = [
    createStripeCusIfNotExists({
      db,
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
        org,
        env,
        logger,
        product,
      }),
    );
  }

  await Promise.all(batchInit);
};

const handleIdIsNull = async ({
  req,
  db,
  org,
  env,
  newCus,
  logger,
  processor,
  createDefaultProducts,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
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
    db,
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
    req,
    db,
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
  req,
  db,
  org,
  env,
  logger,
  newCus,
  processor,
  createDefaultProducts = true,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  logger: any;
  newCus: CreateCustomer;
  processor?: any;
  createDefaultProducts?: boolean;
}) => {
  // 1. Get by ID
  let existingCustomer = await CusService.get({
    db,
    idOrInternalId: newCus.id!,
    orgId: org.id,
    env,
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
      db,
      email: newCus.email!,
      orgId: org.id,
      env,
    });

    if (cusWithEmail.length === 1 && cusWithEmail[0].id === null) {
      logger.info(
        `POST /customers, email ${newCus.email} and ID null found, updating ID to ${newCus.id} (org: ${org.slug})`,
      );

      let updatedCustomer = await CusService.update({
        db,
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
    req,
    db,
    org,
    env,
    customer: newCus,
    logger,
    processor,
    createDefaultProducts,
  });
};

export const handleCreateCustomer = async ({
  req,
  db,
  cusData,
  org,
  env,
  logger,
  processor,
  createDefaultProducts = true,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  cusData: CreateCustomer;
  org: Organization;
  env: AppEnv;
  logger: any;
  processor?: any;
  createDefaultProducts?: boolean;
}) => {
  const newCus = CreateCustomerSchema.parse(cusData);

  // 1. If no ID and email is not NULL
  let createdCustomer;
  if (newCus.id === null) {
    createdCustomer = await handleIdIsNull({
      req,
      db,
      org,
      env,
      newCus,
      logger,
      processor,
      createDefaultProducts,
    });
  } else {
    createdCustomer = await handleCreateCustomerWithId({
      req,
      db,
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
