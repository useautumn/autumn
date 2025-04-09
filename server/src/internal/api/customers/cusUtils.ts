import {
  BillingInterval,
  CreateCustomerSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
  CustomerData,
  CustomerResponseSchema,
  CustomerSchema,
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  FullProduct,
  Organization,
  ProductSchema,
} from "@autumn/shared";

import { CreateCustomer } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "@autumn/shared";

import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";

import { z } from "zod";
import {
  fullCusProductToCusEnts,
  fullCusProductToCusPrices,
  processFullCusProduct,
} from "@/internal/customers/products/cusProductUtils.js";
import {
  getCusBalancesByEntitlement,
  sortCusEntsForDeduction,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { processInvoice } from "@/internal/customers/invoices/InvoiceService.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { initGroupBalancesFromGetCus } from "@/internal/customers/entitlements/groupByUtils.js";
import { EntityService } from "../entities/EntityService.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import { createNewCustomer } from "./handlers/handleCreateCustomer.js";
import { format } from "date-fns";

export const updateCustomerDetails = async ({
  sb,
  customer,
  customerData,
  logger,
}: {
  sb: SupabaseClient;
  customer: Customer;
  customerData?: CustomerData;
  logger: any;
}) => {
  let updates: any = {};
  if (!customer.name && customerData?.name) {
    updates.name = customerData.name;
  }
  if (!customer.email && customerData?.email) {
    updates.email = customerData.email;
  }

  if (Object.keys(updates).length > 0) {
    logger.info(`Updating customer details`, { updates });
    customer = await CusService.update({
      sb,
      internalCusId: customer.internal_id,
      update: updates,
    });
  }

  return customer;
};

export const getOrCreateCustomer = async ({
  sb,
  orgId,
  env,
  customerId,
  customerData,
  logger,
  skipGet = false,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customerId: string;
  customerData?: CustomerData;
  logger: any;
  skipGet?: boolean;
}) => {
  let customer;

  if (!skipGet) {
    customer = await CusService.getByIdOrInternalId({
      sb,
      idOrInternalId: customerId,
      orgId,
      env,
      // isFull: true,
    });
  }

  if (!customer) {
    logger.info(`no customer found, creating new`, { customerData });
    customer = await createNewCustomer({
      sb,
      orgId,
      env,
      customer: {
        id: customerId,
        name: customerData?.name || "",
        email: customerData?.email || "",
        fingerprint: customerData?.fingerprint,
      },
      logger,
    });
  }

  customer = await updateCustomerDetails({
    sb,
    customer,
    customerData,
    logger,
  });

  return customer;
};

export const getCusByIdOrInternalId = async ({
  sb,
  idOrInternalId,
  orgId,
  env,
  isFull = false,
}: {
  sb: SupabaseClient;
  idOrInternalId: string;
  orgId: string;
  env: AppEnv;
  isFull?: boolean;
}) => {
  const customer = await CusService.getByIdOrInternalId({
    sb,
    orgId,
    env,
    idOrInternalId,
    isFull,
  });

  return customer;
};

export const attachDefaultProducts = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
  org,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: Customer;
  org: Organization;
  nextResetAt?: number;
}) => {
  const defaultProds = await ProductService.getFullDefaultProducts({
    sb,
    orgId,
    env,
  });

  for (const product of defaultProds) {
    await createFullCusProduct({
      sb,
      attachParams: {
        org,
        customer: customer,
        product,
        prices: product.prices,
        entitlements: product.entitlements,
        freeTrial: null, // TODO: Free trial not supported on default product yet
        optionsList: [],
        entities: [],
      },
      nextResetAt,
    });
  }
};

const CusProductResultSchema = CusProductSchema.extend({
  customer: CustomerSchema,
  product: ProductSchema,
});

export const flipProductResults = (
  cusProducts: z.infer<typeof CusProductResultSchema>[]
) => {
  const customers = [];

  for (const cusProduct of cusProducts) {
    customers.push({
      ...cusProduct.customer,
      customer_products: [cusProduct],
    });
  }
  return customers;
};

// getCustomerDetails helpers
const getCusInvoices = async ({
  sb,
  internalCustomerId,
  limit = 20,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  limit?: number;
}) => {
  // Get customer invoices
  const invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId,
    limit,
  });

  const processedInvoices = invoices.map(processInvoice);

  return processedInvoices;
};

const processFullCusProducts = ({
  fullCusProducts,
  subs,
  org,
}: {
  fullCusProducts: any;
  subs: any;
  org: Organization;
}) => {
  // Process full cus products
  let main = [];
  let addOns = [];
  for (const cusProduct of fullCusProducts) {
    let processed = processFullCusProduct({ cusProduct, subs, org });

    let isAddOn = cusProduct.product.is_add_on;
    if (isAddOn) {
      addOns.push(processed);
    } else {
      main.push(processed);
    }
  }

  return { main, addOns };
};

export const getCustomerDetails = async ({
  customer,
  sb,
  orgId,
  env,
  params = {},
  logger,
}: {
  customer: Customer;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  params?: any;
  logger: any;
}) => {
  // 1. Get full customer products & processed invoices
  const [fullCusProducts, processedInvoices, entities, org] = await Promise.all(
    [
      CusService.getFullCusProducts({
        sb,
        internalCustomerId: customer.internal_id,
        withProduct: true,
        withPrices: true,
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
        ],
        logger,
      }),
      getCusInvoices({
        sb,
        internalCustomerId: customer.internal_id,
        limit: 20,
      }),
      EntityService.getByInternalCustomerId({
        sb,
        internalCustomerId: customer.internal_id,
        logger,
      }),
      OrgService.getFullOrg({
        sb,
        orgId,
      }),
    ]
  );

  let stripeCli = createStripeCli({
    org,
    env,
  });

  let subs;
  let subIds = fullCusProducts.flatMap(
    (cp: FullCusProduct) => cp.subscription_ids
  );

  if (org.config.api_version >= BREAK_API_VERSION) {
    subs = await getStripeSubs({
      stripeCli,
      subIds,
    });
  }

  // 2. Initialize group by balances
  let cusEnts = fullCusProductToCusEnts(fullCusProducts) as any;

  // 3. Get entitlements
  const balances = await getCusBalancesByEntitlement({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
    entities,
    org,
  });

  const { main, addOns } = processFullCusProducts({
    fullCusProducts,
    subs,
    org,
  });

  // return {
  //   customer,
  //   main,
  //   addOns,
  //   balances,
  //   invoices: processedInvoices,
  // };
  return {
    customer: CustomerResponseSchema.parse(customer),
    products: main,
    add_ons: addOns,
    entitlements: balances,
    invoices: processedInvoices,
  };
};

// IMPORTANT FUNCTION
export const getCusEntsInFeatures = async ({
  sb,
  internalCustomerId,
  internalFeatureIds,
  inStatuses = [CusProductStatus.Active],
  withPrices = false,
  withProduct = false,
  logger,
  reverseOrder = false,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureIds?: string[];
  inStatuses?: CusProductStatus[];
  withPrices?: boolean;
  withProduct?: boolean;
  logger: any;
  reverseOrder?: boolean;
}) => {
  const fullCusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId,
    inStatuses: inStatuses,
    withPrices: withPrices,
    withProduct: withProduct,
    logger,
  });

  const cusEntsWithCusProduct = fullCusProductToCusEnts(
    fullCusProducts!,
    inStatuses
  );

  if (!cusEntsWithCusProduct) {
    return { cusEnts: [] };
  }

  let cusEnts: FullCustomerEntitlement[] = [];
  if (internalFeatureIds) {
    cusEnts = cusEntsWithCusProduct.filter((cusEnt) =>
      internalFeatureIds.includes(cusEnt.internal_feature_id)
    );
  } else {
    cusEnts = cusEntsWithCusProduct;
  }

  sortCusEntsForDeduction(cusEnts, reverseOrder);

  if (!withPrices) {
    return { cusEnts, cusPrices: undefined };
  }

  const cusPrices = fullCusProductToCusPrices(fullCusProducts, inStatuses);

  return { cusEnts, cusPrices };
};
