import {
  BillingInterval,
  CreateCustomerSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
  CustomerSchema,
  ErrCode,
  FullCusProduct,
  FullProduct,
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
import RecaseError from "@/utils/errorUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import {
  initProductInStripe,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { getNextStartOfMonthUnix } from "@/internal/prices/billingIntervalUtils.js";
import { StatusCodes } from "http-status-codes";

export const getCustomerByIdOrEmail = async ({
  sb,
  id,
  email,
  orgId,
  env,
  isFull = false,
  logger,
}: {
  sb: SupabaseClient;
  id: string;
  email: string;
  orgId: string;
  env: AppEnv;
  isFull?: boolean;
  logger: any;
}) => {
  if (email && email.includes("%40")) {
    email = email.replace("%40", "@");
  }

  if (!email && !id) {
    throw new RecaseError({
      message: "Customer ID or email is required",
      code: ErrCode.InvalidCustomer,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  let customer: Customer;
  if (email) {
    console.log("Searching for customer by email", email);
    const customers = await CusService.getByEmail({
      sb,
      email,
      orgId,
      env,
    });

    if (customers.length !== 1) {
      throw new RecaseError({
        message: `Customer with email ${email} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (isFull) {
      customer = await CusService.getFullCustomer({
        sb,
        orgId,
        env,
        customerId: customers[0].id,
      });
    } else {
      customer = customers[0];
    }
  } else {
    customer = isFull
      ? await CusService.getFullCustomer({
          sb,
          orgId,
          env,
          customerId: id,
        })
      : await CusService.getById({ sb, id, orgId, env, logger });
  }

  return customer;
};

const initStripeCusAndProducts = async ({
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
  logger,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
  logger: any;
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

  // Attach default product to customer
  const defaultProds = await ProductService.getFullDefaultProducts({
    sb,
    orgId,
    env,
  });

  const nonFreeProds = defaultProds.filter((p) => !isFreeProduct(p.prices));
  const freeProds = defaultProds.filter((p) => isFreeProduct(p.prices));

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
  const [fullCusProducts, processedInvoices] = await Promise.all([
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
  ]);

  // 2. Initialize group by balances
  let cusEnts = fullCusProductToCusEnts(fullCusProducts) as any;
  await initGroupBalancesFromGetCus({
    sb,
    cusEnts,
    params,
  });

  // Get entitlements
  const balances = await getCusBalancesByEntitlement({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
    groupVals: params,
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
  logger,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureIds: string[];
  inStatuses?: CusProductStatus[];
  withPrices?: boolean;
  logger: any;
}) => {
  const fullCusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId,
    inStatuses: inStatuses,
    withPrices: withPrices,
    logger,
  });

  const cusEntsWithCusProduct = fullCusProductToCusEnts(
    fullCusProducts!,
    inStatuses
  );

  if (!cusEntsWithCusProduct) {
    return { cusEnts: [] };
  }

  const cusEnts = cusEntsWithCusProduct.filter((cusEnt) =>
    internalFeatureIds.includes(cusEnt.internal_feature_id)
  );

  sortCusEntsForDeduction(cusEnts);

  if (!withPrices) {
    return { cusEnts, cusPrices: undefined };
  }

  const cusPrices = fullCusProductToCusPrices(fullCusProducts, inStatuses);

  return { cusEnts, cusPrices };
};
