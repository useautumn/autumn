import {
  CusProductSchema,
  CusProductStatus,
  CusResponseSchema,
  Customer,
  CustomerData,
  CustomerResponseSchema,
  CustomerSchema,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
  ProductSchema,
} from "@autumn/shared";

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
import { sortCusEntsForDeduction } from "@/internal/customers/entitlements/cusEntUtils.js";
import { getCusBalances } from "@/internal/customers/entitlements/getCusBalances.js";
import { processInvoice } from "@/internal/customers/invoices/InvoiceService.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { EntityService } from "../entities/EntityService.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import {
  createNewCustomer,
  handleCreateCustomer,
} from "./handlers/handleCreateCustomer.js";
import { APIVersion, getApiVersion } from "@/utils/versionUtils.js";

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
  orgSlug,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customerId: string;
  customerData?: CustomerData;
  logger: any;
  skipGet?: boolean;
  orgSlug: string;
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
    try {
      customer = await handleCreateCustomer({
        cusData: {
          id: customerId,
          name: customerData?.name,
          email: customerData?.email,
          fingerprint: customerData?.fingerprint,
        },
        sb,
        orgId,
        env,
        logger,
        orgSlug: "",
        getDetails: false,
      });
    } catch (error: any) {
      if (error?.data?.code == "23505") {
        customer = await CusService.getByIdOrInternalId({
          sb,
          idOrInternalId: customerId,
          orgId,
          env,
        });
      } else {
        throw error;
      }
    }
    // customer = await createNewCustomer({
    //   sb,
    //   orgId,
    //   env,
    //   customer: {
    //     id: customerId,
    //     name: customerData?.name || "",
    //     email: customerData?.email || "",
    //     fingerprint: customerData?.fingerprint,
    //   },
    //   logger,
    // });
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
export const getCusInvoices = async ({
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

export const processFullCusProducts = ({
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
    inStatuses,
    reverseOrder
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

  // sortCusEntsForDeduction(cusEnts, reverseOrder);

  if (!withPrices) {
    return { cusEnts, cusPrices: undefined };
  }

  const cusPrices = fullCusProductToCusPrices(fullCusProducts, inStatuses);

  return { cusEnts, cusPrices };
};
