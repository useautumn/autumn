import {
  AllowanceType,
  AppEnv,
  CusProductSchema,
  CusProductStatus,
  Customer,
  CustomerData,
  Entitlement,
  Feature,
  FeatureOptions,
  FeatureType,
  FixedPriceConfig,
  FixedPriceConfigSchema,
  FreeTrial,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  FullProduct,
  Organization,
  Price,
  PriceType,
  UsagePriceConfig,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import {
  getBillingType,
  getPriceOptions,
  getUsageTier,
  pricesAreSame,
} from "@/internal/prices/priceUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";

import { ErrCode } from "@/errors/errCodes.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { PricesInput } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/prices/PriceService.js";

import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import { StatusCodes } from "http-status-codes";
import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { createNewCustomer } from "@/internal/api/customers/cusUtils.js";
import { CusProductService } from "./CusProductService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import Stripe from "stripe";
import { deleteScheduledIds } from "@/external/stripe/stripeSubUtils.js";

// 1. Delete future product
export const uncancelCurrentProduct = async ({
  sb,
  curCusProduct,
  org,
  env,
  internalCustomerId,
  productGroup,
}: {
  sb: SupabaseClient;
  curCusProduct?: FullCusProduct;
  org: Organization;
  internalCustomerId: string;
  productGroup: string;
  env: AppEnv;
}) => {
  if (!curCusProduct) {
    curCusProduct = await CusProductService.getCurrentProductByGroup({
      sb,
      internalCustomerId: internalCustomerId,
      productGroup: productGroup,
    });
  }

  const stripeCli = createStripeCli({
    org,
    env,
  });

  if (
    curCusProduct &&
    curCusProduct.subscription_ids &&
    curCusProduct.subscription_ids.length > 0
  ) {
    const uncancelSub = async (subId: string) => {
      await stripeCli.subscriptions.update(subId, {
        cancel_at: null,
      });
    };

    let subIds = curCusProduct.subscription_ids;
    if (subIds && subIds.length > 0) {
      const batchUncancel = [];
      for (const subId of subIds) {
        batchUncancel.push(uncancelSub(subId));
      }
      await Promise.all(batchUncancel);
    }
  }
};

// 1. Cancel cusProductSubscriptions
export const cancelCusProductSubscriptions = async ({
  sb,
  cusProduct,
  org,
  env,
  excludeIds,
}: {
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  org: Organization;
  env: AppEnv;
  excludeIds?: string[];
}) => {
  // 1. Cancel all subscriptions
  const stripeCli = createStripeCli({
    org: org,
    env: env,
  });

  const cancelStripeSub = async (subId: string) => {
    if (excludeIds && excludeIds.includes(subId)) {
      return;
    }

    try {
      await stripeCli.subscriptions.cancel(subId);
      console.log(
        `Cancelled stripe subscription ${subId}, org: ${org.slug}, product: ${cusProduct.product.name}, customer: ${cusProduct.customer.id}`
      );
    } catch (error: any) {
      if (error.code != "resource_missing") {
        console.log(
          `Error canceling stripe subscription ${error.code}: ${error.message}`
        );
      } // else subscription probably already cancelled
    }
  };

  if (cusProduct.subscription_ids && cusProduct.subscription_ids.length > 0) {
    const batchCancel = [];
    for (const subId of cusProduct.subscription_ids) {
      batchCancel.push(cancelStripeSub(subId));
    }
    await Promise.all(batchCancel);
    return true;
  }

  return false;
};

export const activateDefaultProduct = async ({
  productGroup,
  orgId,
  customer,
  org,
  sb,
  env,
  curCusProduct,
}: {
  productGroup: string;
  orgId: string;
  customer: Customer;
  org: Organization;
  sb: SupabaseClient;
  env: AppEnv;
  curCusProduct?: FullCusProduct;
}) => {
  // 1. Expire current product
  const defaultProducts = await ProductService.getFullDefaultProducts({
    sb,
    orgId: org.id,
    env,
  });

  const defaultProd = defaultProducts.find((p) => p.group === productGroup);

  if (!defaultProd) {
    return false;
  }

  if (
    curCusProduct &&
    curCusProduct.internal_product_id == defaultProd.internal_id
  ) {
    console.log("   ❌ default product is already active");
    return false;
  }

  await createFullCusProduct({
    sb,
    attachParams: {
      org,
      customer,
      product: defaultProd,
      prices: defaultProd.prices,
      entitlements: defaultProd.entitlements,
      freeTrial: defaultProd.free_trial,
      optionsList: [],
    },
  });

  console.log("   ✅ activated default product");
  return true;
};

export const expireAndActivate = async ({
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
  await CusProductService.update({
    sb,
    cusProductId: cusProduct.id,
    updates: { status: CusProductStatus.Expired, ended_at: Date.now() },
  });

  await activateDefaultProduct({
    productGroup: cusProduct.product.group,
    orgId: org.id,
    customer: cusProduct.customer,
    org,
    sb,
    env,
  });
};

export const activateFutureProduct = async ({
  sb,
  cusProduct,
  subscription,
  org,
  env,
}: {
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({
    org,
    env,
  });

  const futureProduct = await CusProductService.getFutureProduct({
    sb,
    internalCustomerId: cusProduct.internal_customer_id,
    productGroup: cusProduct.product.group,
  });

  if (!futureProduct) {
    return false;
  }

  if (!subscription.cancel_at_period_end) {
    console.log(
      "   🔔 Subscription canceled before period end, deleting scheduled products"
    );
    await deleteScheduledIds({
      stripeCli,
      scheduledIds: futureProduct.scheduled_ids,
    });
    await CusProductService.delete({
      sb,
      cusProductId: futureProduct.id,
    });
    return false;
  } else {
    await CusProductService.update({
      sb,
      cusProductId: futureProduct.id,
      updates: { status: CusProductStatus.Active },
    });
    return true;
  }
};

// OTHERS
export const fullCusProductToCusEnts = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active]
) => {
  const cusEnts: FullCustomerEntitlement[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusEnts.push(
      ...cusProduct.customer_entitlements.map((cusEnt) => ({
        ...cusEnt,
        customer_product: CusProductSchema.parse(cusProduct),
      }))
    );
  }

  return cusEnts;
};

export const fullCusProductToCusPrices = (cusProducts: FullCusProduct[]) => {
  const cusPrices: FullCustomerPrice[] = [];

  for (const cusProduct of cusProducts) {
    cusPrices.push(...cusProduct.customer_prices);
  }

  return cusPrices;
};

export const processFullCusProduct = (cusProduct: FullCusProduct) => {
  // Process prices
  const prices = cusProduct.customer_prices.map((cp) => {
    let price = cp.price;

    if (price.config?.type == PriceType.Fixed) {
      let config = price.config as FixedPriceConfig;
      return {
        amount: config.amount,
        interval: config.interval,
      };
    } else {
      let config = price.config as UsagePriceConfig;
      let priceOptions = getPriceOptions(price, cusProduct.options);
      let usageTier = getUsageTier(price, priceOptions?.quantity!);

      return {
        amount: usageTier.amount,
        interval: config.interval,
        quantity: priceOptions?.quantity,
      };
    }
  });
  const trialing =
    cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();
  return {
    id: cusProduct.product.id,
    name: cusProduct.product.name,
    group: cusProduct.product.group,
    status: trialing ? CusProductStatus.Trialing : cusProduct.status,
    created_at: cusProduct.created_at,
    canceled_at: cusProduct.canceled_at,
    processor: {
      type: cusProduct.processor?.type,
      subscription_id: cusProduct.processor?.subscription_id || null,
    },
    subscription_ids: cusProduct.subscription_ids || [],
    prices: prices,
    starts_at: cusProduct.starts_at,
    // prices: cusProduct.customer_prices,
    // entitlements: cusProduct.customer_entitlements,
  };
};

export const getProductAndOrg = async ({
  sb,

  productId,
  orgId,
  env,
}: {
  sb: SupabaseClient;

  productId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let fullProduct;
  try {
    fullProduct = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });
  } catch (error) {
    throw new RecaseError({
      message: `Failed to get product ${productId}`,
      statusCode: StatusCodes.NOT_FOUND,
      code: ErrCode.ProductNotFound,
    });
  }

  let fullOrg;
  try {
    fullOrg = await OrgService.getFullOrg({
      sb,
      orgId,
    });
  } catch (error) {
    throw new RecaseError({
      message: `Failed to get organization ${orgId}`,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      code: ErrCode.InternalError,
    });
  }

  return { fullProduct, org: fullOrg };
};

// GET PRICES
const validatePriceConfig = (price: Price) => {
  if (!price.config?.type) {
    return {
      valid: false,
      error: "Missing `type` field in price config",
    };
  }

  if (price.config?.type == PriceType.Fixed) {
    try {
      FixedPriceConfigSchema.parse(price.config);
    } catch (error: any) {
      console.log("Error validating price config", error);
      return {
        valid: false,
        error: "Invalid fixed price config | " + formatZodError(error),
      };
    }
  } else {
    try {
      UsagePriceConfigSchema.parse(price.config);
    } catch (error: any) {
      console.log("Error validating price config", error);
      return {
        valid: false,
        error: "Invalid usage price config | " + formatZodError(error),
      };
    }
  }

  return {
    valid: true,
    error: null,
  };
};

export const getDefaultAndCustomPrices = ({
  product,
  pricesInput,
}: {
  product: FullProduct;
  pricesInput: Price[];
}) => {
  const idToPrice: { [key: string]: Price } = {};
  for (const price of product.prices) {
    idToPrice[price.id!] = price;
  }

  const customPrices: Price[] = [];
  let defaultPrices: Price[] = [...product.prices];

  for (let i = 0; i < pricesInput.length; i++) {
    const price = pricesInput[i];

    const { valid, error } = validatePriceConfig(price as any);
    if (!valid) {
      throw new RecaseError({
        code: ErrCode.InvalidPriceConfig,
        message: error || "Invalid price config",
        statusCode: 400,
      });
    }

    // Check if it's existing price
    const existingPrice = idToPrice[price.id!];
    const replacePrice =
      existingPrice && !pricesAreSame(existingPrice, price as any);

    const createNewPrice = !existingPrice;

    if (createNewPrice || replacePrice) {
      // Create new custom price for it...
      customPrices.push({
        id: generateId("pr"),
        name: price.name || "",
        // org_id: product.org_id,
        // product_id: product.id,
        created_at: Date.now(),
        billing_type: getBillingType(price.config!),

        config: price.config,
        is_custom: true,
      });
    }

    if (replacePrice) {
      defaultPrices = defaultPrices.filter((p) => p.id != existingPrice.id);
    }
  }

  return { defaultPrices, customPrices };
};

// GET ENTITLEMENTS
const validateEntitlement = (ent: Entitlement, features: Feature[]) => {
  const feature = features.find((f) => ent.feature_id == f.id);
  if (!feature) {
    throw new RecaseError({
      code: ErrCode.FeatureNotFound,
      message: `Feature ${ent.feature_id} not found`,
      statusCode: 400,
    });
  }

  if (feature.type == FeatureType.Boolean) {
    return feature;
  }

  if (!ent.allowance_type) {
    throw new RecaseError({
      code: ErrCode.InvalidEntitlement,
      message: `Allowance type is required for feature ${ent.feature_id}`,
      statusCode: 400,
    });
  }

  if (ent.allowance_type == AllowanceType.Fixed) {
    if (!ent.allowance || ent.allowance <= 0) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Allowance is required for feature ${ent.feature_id}`,
        statusCode: 400,
      });
    }

    if (!ent.interval) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Interval is required for feature ${ent.feature_id}`,
        statusCode: 400,
      });
    }
  }

  return feature;
};

const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
  if (ent1.allowance_type != ent2.allowance_type) return false;
  if (ent1.allowance_type == AllowanceType.Fixed) {
    if (ent1.allowance != ent2.allowance) return false;
    if (ent1.interval != ent2.interval) return false;
  }

  return true;
};

export const getDefaultAndCustomEnts = ({
  product,
  entsInput,
  features,
  prices,
}: {
  product: FullProduct;
  features: Feature[];
  entsInput: Entitlement[];
  prices: Price[];
}) => {
  let defaultEnts = [...product.entitlements];
  const featureToEnt: { [key: string]: Entitlement } = {};
  for (const ent of defaultEnts) {
    featureToEnt[ent.feature_id!] = ent;
  }

  const customEnts: any = [];

  for (const ent of entsInput) {
    // 1. Validate entitlement
    if (!validateEntitlement(ent, features)) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Invalid entitlement`,
        statusCode: 400,
      });
    }

    const feature = features.find((f) => f.id == ent.feature_id);
    const existingEnt = featureToEnt[ent.feature_id!];
    const replaceEnt = existingEnt && !entsAreSame(existingEnt, ent);
    const createNewEnt = !existingEnt;

    let newId = generateId("ent");

    // 3. If replaceEnt, remove from defaultEnts and update related price
    if (replaceEnt) {
      let relatedPriceIndex = prices.findIndex(
        (p) =>
          p.config &&
          "entitlement_id" in p.config &&
          p.config?.entitlement_id == existingEnt.id
      );

      if (relatedPriceIndex != -1) {
        // @ts-ignore
        prices[relatedPriceIndex].config!.entitlement_id = newId;
      }
    }

    // 4. If new ent, push to customEnts
    if (createNewEnt || replaceEnt) {
      customEnts.push({
        id: newId,

        created_at: Date.now(),
        feature_id: ent.feature_id,
        internal_feature_id: feature!.internal_id,
        is_custom: true,

        allowance_type: ent.allowance_type,
        allowance: ent.allowance,
        interval: ent.interval,
      });

      defaultEnts = defaultEnts.filter(
        (e) => e.feature_id != existingEnt.feature_id
      );
    }
  }

  return { defaultEnts, customEnts };
};

// PROCESS PRICES AND ENTITLEMENTS
export const processPricesAndEntsInput = async ({
  sb,
  product,
  pricesInput,
  entsInput,
  features,
}: {
  sb: SupabaseClient;
  product: FullProduct;
  pricesInput: PricesInput;
  entsInput: Entitlement[];
  features: Feature[];
}) => {
  // 1. Get prices and entitlements
  const { defaultPrices, customPrices } = getDefaultAndCustomPrices({
    product,
    pricesInput,
  });

  const prices = [...defaultPrices, ...customPrices];

  const { defaultEnts, customEnts } = getDefaultAndCustomEnts({
    product,
    entsInput,
    features,
    prices,
  });

  const entitlements = [...defaultEnts, ...customEnts];

  if (customEnts.length > 0) {
    console.log("Inserting custom entitlements");
    await EntitlementService.insert({ sb, data: customEnts });
  }

  if (customPrices.length > 0) {
    console.log("Inserting custom prices");
    await PriceService.insert({ sb, data: customPrices });
  }

  const entsWithFeature = entitlements.map((ent) => ({
    ...ent,
    feature: features.find((f) => f.internal_id === ent.internal_feature_id),
  }));

  return { prices, entitlements: entsWithFeature };
};

export const processEntsInput = async ({
  sb,
  product,
  entsInput,
}: {
  sb: SupabaseClient;
  product: FullProduct;
  entsInput: Entitlement[];
}) => {
  const productEnts = [...product.entitlements];
  const featureToEnt: { [key: string]: Entitlement } = {};
  for (const ent of productEnts) {
    featureToEnt[ent.feature_id!] = ent;
  }

  for (const ent of entsInput) {
    // 1. Handle changed entitlements
    if (featureToEnt[ent.feature_id!]) {
      // Check if config is the same
      if (entsAreSame(featureToEnt[ent.feature_id!], ent)) {
        continue;
      }
    }
  }
};

const getOrCreateCustomer = async ({
  sb,
  customerId,
  customerData,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerId: string;
  customerData?: CustomerData;
  orgId: string;
  env: AppEnv;
}) => {
  let customer = await CusService.getById({
    sb,
    id: customerId,
    orgId,
    env,
  });

  if (!customer) {
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
    });
  }

  return customer;
};

export const getFullCusProductData = async ({
  sb,
  customerId,
  customerData,
  productId,
  orgId,
  pricesInput,
  entsInput,
  env,
  optionsListInput,
  freeTrialInput,
  isCustom = false,
}: {
  sb: SupabaseClient;
  customerId: string;
  customerData: Customer;
  productId: string;
  orgId: string;
  pricesInput: PricesInput;
  entsInput: Entitlement[];
  env: AppEnv;
  optionsListInput: FeatureOptions[];

  freeTrialInput: FreeTrial | null;
  isCustom?: boolean;
}) => {
  const customer = await getOrCreateCustomer({
    sb,
    customerId,
    customerData,
    orgId,
    env,
  });

  // 1. Get customer, product, org & features
  const { fullProduct, org } = await getProductAndOrg({
    sb,
    productId,
    orgId,
    env,
  });

  const features = await FeatureService.getFeatures({
    sb,
    orgId,
    env,
  });

  let newOptionsList: FeatureOptions[] = [];

  for (const options of optionsListInput) {
    const feature = features.find(
      (feature) => feature.id === options.feature_id
    );

    if (!feature) {
      throw new RecaseError({
        message: `Feature ${options.feature_id} not found`,
        code: ErrCode.FeatureNotFound,
        statusCode: 400,
      });
    }

    newOptionsList.push({
      ...options,
      internal_feature_id: feature.internal_id,
    });
  }

  if (!isCustom) {
    let freeTrial = await getFreeTrialAfterFingerprint({
      sb,
      freeTrial: fullProduct.free_trial,
      fingerprint: customer.fingerprint,
      internalCustomerId: customer.internal_id,
    });

    return {
      customer,
      product: fullProduct,
      org,
      features,
      optionsList: newOptionsList,
      prices: fullProduct.prices,
      entitlements: fullProduct.entitlements.map((ent: any) => ({
        ...ent,
        feature: features.find(
          (f) => f.internal_id === ent.internal_feature_id
        ),
      })),
      freeTrial,
    };
  }

  const entitlements = await handleNewEntitlements({
    sb,
    newEnts: entsInput,
    curEnts: fullProduct.entitlements,
    internalProductId: fullProduct.internal_id,
    orgId,
    isCustom,
    features,
    prices: pricesInput,
  });

  const entitlementsWithFeature = entitlements!.map((ent) => ({
    ...ent,
    feature: features.find((f) => f.internal_id === ent.internal_feature_id),
  }));

  // 1. Get prices
  const prices = await handleNewPrices({
    sb,
    newPrices: pricesInput,
    curPrices: fullProduct.prices,
    internalProductId: fullProduct.internal_id,
    isCustom,
    features,
    env,
    product: fullProduct,
    org,
    entitlements: entitlementsWithFeature,
  });

  const freeTrial = await handleNewFreeTrial({
    sb,
    curFreeTrial: fullProduct.free_trial,
    newFreeTrial: freeTrialInput || null,
    internalProductId: fullProduct.internal_id,
    isCustom,
  });

  const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
    sb,
    freeTrial: freeTrial,
    fingerprint: customer.fingerprint,
    internalCustomerId: customer.internal_id,
  });

  return {
    customer,
    product: fullProduct,
    org,
    features,
    optionsList: newOptionsList,
    prices,
    entitlements: entitlementsWithFeature,
    freeTrial: uniqueFreeTrial,
  };
};
