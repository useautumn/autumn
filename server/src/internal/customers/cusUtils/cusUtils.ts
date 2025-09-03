import { z } from "zod";
import {
  CusExpand,
  Customer,
  CustomerData,
  ErrCode,
  Feature,
  FullCustomer,
  Invoice,
  InvoiceResponse,
  Organization,
  sortCusEntsForDeduction,
} from "@autumn/shared";

import { CusService } from "@/internal/customers/CusService.js";

import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { StatusCodes } from "http-status-codes";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { processInvoice } from "@/internal/invoices/InvoiceService.js";
import { refreshCusCache } from "../cusCache/updateCachedCus.js";

export const updateCustomerDetails = async ({
  db,
  customer,
  customerData,
  org,
  logger,
}: {
  db: DrizzleCli;
  customer: any;
  customerData?: CustomerData;
  org: Organization;
  logger: any;
}) => {
  let updates: any = {};
  if (!customer.name && customerData?.name) {
    updates.name = customerData.name;
  }
  if (!customer.email && customerData?.email) {
    // Check that email is valid, if not skip...
    if (z.string().email().safeParse(customerData.email).error) {
      logger.info(`Invalid email ${customerData.email}, skipping update`);
    } else {
      updates.email = customerData.email;
    }
  }

  if (Object.keys(updates).length > 0) {
    logger.info(`Updating customer details:`, {
      data: updates,
    });
    await CusService.update({
      db,
      internalCusId: customer.internal_id,
      update: updates,
    });
    customer = { ...customer, ...updates };

    await refreshCusCache({
      db,
      customerId: customer.id!,
      org: org,
      env: customer.env,
    });
  }

  return customer;
};

export const getCusInvoices = async ({
  db,
  internalCustomerId,
  invoices,
  limit = 10,
  withItems = false,
  features,
}: {
  db: DrizzleCli;
  internalCustomerId: string;
  invoices?: Invoice[];
  limit?: number;
  withItems?: boolean;
  features?: Feature[];
}): Promise<InvoiceResponse[]> => {
  const finalInvoices = notNullish(invoices)
    ? invoices
    : await InvoiceService.list({
        db,
        internalCustomerId,
        limit,
      });

  const processedInvoices = finalInvoices!.map((i) =>
    processInvoice({
      invoice: i,
      withItems,
      features,
    })
  );

  return processedInvoices;
};

// IMPORTANT FUNCTION
export const getCusEntsInFeatures = async ({
  customer,
  internalFeatureIds,
  logger,
  reverseOrder = false,
}: {
  customer: FullCustomer;
  internalFeatureIds?: string[];
  logger: any;
  reverseOrder?: boolean;
}) => {
  let cusProducts = customer.customer_products;

  // This is important, attaching customer_product to cus ent is used elsewhere, don't delete.
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

export const parseCusExpand = (expand?: string): CusExpand[] => {
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

export const newCusToFullCus = ({ newCus }: { newCus: Customer }) => {
  let fullCus: FullCustomer = {
    ...newCus,
    customer_products: [],
    entities: [],
  };

  return fullCus;
};
