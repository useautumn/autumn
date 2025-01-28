import {
  AllowanceType,
  AppEnv,
  Customer,
  Entitlement,
  Feature,
  FeatureOptions,
  FeatureType,
  FixedPriceConfigSchema,
  FreeTrial,
  FullProduct,
  Price,
  PriceType,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import { getBillingType, pricesAreSame } from "@/internal/prices/priceUtils.js";
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
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService.js";
import {
  trialFingerprintExists,
  validateFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import { StatusCodes } from "http-status-codes";

export const getCustomerProductAndOrg = async ({
  sb,
  customerId,
  productId,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerId: string;
  productId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let customer;

  try {
    customer = await CusService.getCustomer({
      sb,
      customerId,
      orgId,
      env,
    });
    if (!customer) {
      throw new Error("Customer not found");
    }
  } catch (error) {
    throw new RecaseError({
      message: `Failed to get customer ${customerId}`,
      statusCode: StatusCodes.NOT_FOUND,
      code: ErrCode.CustomerNotFound,
    });
  }

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

  return { customer, fullProduct, org: fullOrg };
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

export const processFreeTrialInput = async ({
  sb,
  product,
  freeTrialInput,
  customer,
}: {
  sb: SupabaseClient;
  product: FullProduct;
  freeTrialInput?: FreeTrial;

  customer: Customer;
}) => {
  // 1. Validate free trial input

  let freeTrial;
  if (!freeTrialInput) {
    return null;
  } else if (product.free_trial?.id === freeTrialInput.id) {
    freeTrial = product.free_trial;
  } else {
    freeTrial = validateFreeTrial({
      freeTrial: freeTrialInput,
      internalProductId: product.internal_id,
      isCustom: true,
    });

    await FreeTrialService.insert({ sb, data: freeTrial });
  }

  if (freeTrial?.unique_fingerprint && customer.fingerprint) {
    let exists = await trialFingerprintExists({
      sb,
      fingerprint: customer.fingerprint,
      freeTrialId: freeTrial.id,
    });

    if (exists) {
      console.log("Trial fingerprint already exists");
      return null;
    }
  }

  return freeTrial;
};

export const getFullCusProductData = async ({
  sb,
  customerId,
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
  productId: string;
  orgId: string;
  pricesInput: PricesInput;
  entsInput: Entitlement[];
  env: AppEnv;
  optionsListInput: FeatureOptions[];

  freeTrialInput?: FreeTrial;
  isCustom?: boolean;
}) => {
  // 1. Get customer, product, org & features
  const { customer, fullProduct, org } = await getCustomerProductAndOrg({
    sb,
    customerId,
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
    return {
      customer,
      product: fullProduct,
      org,
      features,
      optionsList: newOptionsList,
      prices: fullProduct.prices,
      entitlements: fullProduct.entitlements,
      freeTrial: fullProduct.free_trial,
    };
  }

  const { prices, entitlements } = await processPricesAndEntsInput({
    sb,
    product: fullProduct,
    pricesInput,
    entsInput,
    features,
  });

  const freeTrial = await processFreeTrialInput({
    sb,
    product: fullProduct,
    freeTrialInput,
    customer,
  });

  return {
    customer,
    product: fullProduct,
    org,
    features,
    optionsList: newOptionsList,
    prices,
    entitlements,
    freeTrial,
  };
};
