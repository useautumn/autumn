import {
  BillingInterval,
  CreateCustomerSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
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

const processFullCusProducts = (fullCusProducts: any) => {
  // Process full cus products
  let main = [];
  let addOns = [];
  for (const cusProduct of fullCusProducts) {
    let processed = processFullCusProduct(cusProduct);

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
  const [fullCusProducts, processedInvoices, entities] = await Promise.all([
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
  ]);

  // 2. Initialize group by balances
  let cusEnts = fullCusProductToCusEnts(fullCusProducts) as any;

  // 3. Get entitlements
  const balances = await getCusBalancesByEntitlement({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
    entities,
  });

  const { main, addOns } = processFullCusProducts(fullCusProducts);

  return {
    customer,
    main,
    addOns,
    balances,
    invoices: processedInvoices,
  };
};

export const getCusEntsInFeatures = async ({
  sb,
  internalCustomerId,
  internalFeatureIds,
  inStatuses = [CusProductStatus.Active],
  withPrices = false,
  withProduct = false,
  logger,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureIds?: string[];
  inStatuses?: CusProductStatus[];
  withPrices?: boolean;
  withProduct?: boolean;
  logger: any;
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

  sortCusEntsForDeduction(cusEnts);

  if (!withPrices) {
    return { cusEnts, cusPrices: undefined };
  }

  const cusPrices = fullCusProductToCusPrices(fullCusProducts, inStatuses);

  return { cusEnts, cusPrices };
};
