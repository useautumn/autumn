import {
  CreateCustomerSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
  CustomerSchema,
  FullCusProduct,
  Organization,
  ProductSchema,
} from "@autumn/shared";

import { CreateCustomer } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";

import { generateId } from "@/utils/genUtils.js";
import { z } from "zod";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
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

export const createNewCustomer = async ({
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
  console.log("Creating new customer");
  console.log("Org ID:", orgId);
  console.log("Customer data:", customer);

  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const parsedCustomer = CreateCustomerSchema.parse(customer);

  const customerData: Customer = {
    ...parsedCustomer,
    name: parsedCustomer.name || "",
    email: parsedCustomer.email || "",

    internal_id: generateId("cus"),
    org_id: orgId,
    created_at: Date.now(),
    env,
  };

  // let stripeCustomer: Stripe.Customer | undefined;
  // if (org.stripe_connected) {
  //   stripeCustomer = await createStripeCustomer({
  //     org,
  //     env,
  //     customer: customerData,
  //   });
  //   customerData.processor = {
  //     type: ProcessorType.Stripe,
  //     id: stripeCustomer?.id,
  //   };
  // }

  const newCustomer = await CusService.createCustomer({
    sb,
    customer: customerData,
  });

  // Attach default product to customer
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

export const expireAndAddDefaultProduct = async ({
  sb,
  env,
  cusProduct,
  org,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  cusProduct: FullCusProduct;
  org: Organization;
}) => {
  // 1. Expire current product
  const defaultProducts = await ProductService.getFullDefaultProducts({
    sb,
    orgId: org.id,
    env,
  });

  const defaultProd = defaultProducts.find(
    (p) => p.group === cusProduct.product.group
  );

  // 1. Expire current product
  await CusProductService.update({
    sb,
    cusProductId: cusProduct.id,
    updates: { status: CusProductStatus.Expired, ended_at: Date.now() },
  });

  // 2. Add default product
  if (defaultProd) {
    await createFullCusProduct({
      sb,
      attachParams: {
        org,
        customer: cusProduct.customer,
        product: defaultProd,
        prices: defaultProd.prices,
        entitlements: defaultProd.entitlements,
        freeTrial: defaultProd.free_trial,
        optionsList: [],
      },
    });

    console.log("   ✅ activated default product");
  } else {
    console.log("   ⚠️ no default product to activate");
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

export const getCustomerDetails = async ({
  customer,
  sb,
  orgId,
  env,
}: {
  customer: Customer;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
}) => {
  const fullCusProducts: any = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active],
  });

  let main = [];
  let addOns = [];

  // 1. Process products
  for (const cusProduct of fullCusProducts) {
    let processed = processFullCusProduct(cusProduct);

    let isAddOn = cusProduct.product.is_add_on;
    if (isAddOn) {
      addOns.push(processed);
    } else {
      main.push(processed);
    }
  }

  // Get entitlements
  const balances = await getCusBalancesByEntitlement({
    cusEntsWithCusProduct: fullCusProductToCusEnts(fullCusProducts) as any,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
  });

  // Get customer invoices
  const invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId: customer.internal_id,
  });

  const processedInvoices = invoices.map(processInvoice);

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
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureIds: string[];
  inStatuses?: CusProductStatus[];
}) => {
  const fullCusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId,
    inStatuses: inStatuses,
  });

  const cusEntsWithCusProduct = fullCusProductToCusEnts(fullCusProducts!);

  if (!cusEntsWithCusProduct) {
    return { cusEnts: [] };
  }

  const cusEnts = cusEntsWithCusProduct.filter((cusEnt) =>
    internalFeatureIds.includes(cusEnt.internal_feature_id)
  );

  sortCusEntsForDeduction(cusEnts);

  return { cusEnts };
};
