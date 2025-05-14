import { z } from "zod";
import {
  CusExpand,
  CusProductSchema,
  Customer,
  CustomerData,
  CustomerSchema,
  ErrCode,
  Feature,
  FullCustomer,
  InvoiceResponse,
  Organization,
  ProductSchema,
} from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "@autumn/shared";

import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";

import { processFullCusProduct } from "@/internal/customers/products/cusProductUtils.js";
import { processInvoice } from "@/internal/customers/invoices/InvoiceService.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { sortCusEntsForDeduction } from "@/internal/customers/entitlements/cusEntUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { notNullish, nullish } from "@/utils/genUtils.js";

export const updateCustomerDetails = async ({
  sb,
  customer,
  customerData,
  logger,
}: {
  sb: SupabaseClient;
  customer: any;
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
    await CusService.update({
      sb,
      internalCusId: customer.internal_id,
      update: updates,
    });
    customer = { ...customer, ...updates };
  }

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
        features: [],
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

export const getCusInvoices = async ({
  sb,
  internalCustomerId,
  limit = 10,
  withItems = false,
  features,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  limit?: number;
  withItems?: boolean;
  features?: Feature[];
}): Promise<InvoiceResponse[]> => {
  // Get customer invoices
  const invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId,
    limit,
  });

  const processedInvoices = invoices.map((i) =>
    processInvoice({
      invoice: i,
      withItems,
      features,
    })
  );

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
  customer,
  internalFeatureIds,
  logger,
  reverseOrder = false,
}: {
  sb: SupabaseClient;
  customer: FullCustomer;
  internalFeatureIds?: string[];
  logger: any;
  reverseOrder?: boolean;
}) => {
  let cusProducts = customer.customer_products;
  let cusEnts = cusProducts.flatMap((cusProduct) => {
    return cusProduct.customer_entitlements.map((cusEnt) => ({
      ...cusEnt,
      customer_product: cusProduct,
    }));
  });

  let cusPrices = cusProducts.flatMap((cusProduct) => {
    return cusProduct.customer_prices || [];
  });

  if (internalFeatureIds) {
    cusEnts = cusEnts.filter((cusEnt) =>
      internalFeatureIds.includes(cusEnt.internal_feature_id)
    );
  }

  if (customer.entity) {
    let entity = customer.entity;
    cusEnts = cusEnts.filter(
      (cusEnt) =>
        nullish(cusEnt.customer_product.internal_entity_id) ||
        cusEnt.customer_product.internal_entity_id === entity.internal_id
      // || cusEnt.entities
    );
  }

  sortCusEntsForDeduction(cusEnts, reverseOrder);

  return { cusEnts, cusPrices };
};

export const parseCusExpand = (expand: string): CusExpand[] => {
  if (expand) {
    let options = expand.split(",");
    let result: CusExpand[] = [];
    for (const option of options) {
      if (!Object.values(CusExpand).includes(option as CusExpand)) {
        throw new RecaseError({
          message: `Invalid expand option: ${option}`,
          code: ErrCode.InvalidExpand,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
      result.push(option as CusExpand);
    }
    return result;
  } else {
    return [];
  }
};
