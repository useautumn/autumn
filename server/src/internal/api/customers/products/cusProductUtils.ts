import {
  AllowanceType,
  AppEnv,
  Entitlement,
  Feature,
  FeatureOptions,
  FeatureType,
  FixedPriceConfigSchema,
  FullProduct,
  Price,
  PriceType,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";

import { ErrCode } from "@/errors/errCodes.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { PricesInput } from "@autumn/shared";
import { comparePrices } from "@/internal/prices/priceUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { EntitlementService } from "@/internal/products/EntitlementService.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

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
  } catch (error) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      statusCode: 404,
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
      message: `Product ${productId} not found`,
      statusCode: 404,
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
      message: `Organization ${orgId} not found`,
      statusCode: 500,
      code: ErrCode.InternalError,
    });
  }

  return { customer, fullProduct, org: fullOrg };
};

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
  pricesInput: PricesInput;
}) => {
  const customPrices: any = [];
  const replacedIds: string[] = [];
  for (let i = 0; i < pricesInput.length; i++) {
    const price = pricesInput[i];

    let customPriceConfig;
    if (price.id && price.config) {
      const { valid, error } = validatePriceConfig(price as any);
      if (!valid) {
        throw new RecaseError({
          code: ErrCode.InvalidPriceConfig,
          message: error || "Invalid price config",
          statusCode: 400,
        });
      }

      const existingPrice = product.prices.find((p) => p.id == price.id);
      if (existingPrice && comparePrices(existingPrice, price as any)) {
        continue;
      }

      replacedIds.push(price.id);
      customPriceConfig = price.config;
    } else if (price.config) {
      if (!validatePriceConfig(price as any).valid) {
        throw new RecaseError({
          code: ErrCode.InvalidPriceConfig,
          message: "Invalid price config",
          statusCode: 400,
        });
      }

      customPriceConfig = price.config;
    }

    if (customPriceConfig) {
      let id = generateId("pr");
      pricesInput[i].id = id;
      customPrices.push({
        id,
        created_at: Date.now(),
        billing_type: getBillingType(customPriceConfig),
        config: customPriceConfig,
        is_custom: true,
        // product_id: product.id,
      });
    }
  }

  const defaultPrices = product.prices.filter(
    (p) => !replacedIds.some((id: any) => id == p.id)
  );

  return { defaultPrices, customPrices, newPricesInput: pricesInput };
};

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

const compareEnts = (ent1: Entitlement, ent2: Entitlement) => {
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
}: {
  product: FullProduct;
  features: Feature[];
  entsInput: Entitlement[];
}) => {
  const productEnts = product.entitlements;

  let featureToEnt: { [key: string]: Entitlement } = {};
  for (const ent of productEnts) {
    featureToEnt[ent.internal_feature_id!] = ent;
  }

  const customEnts: any = [];
  for (let i = 0; i < entsInput.length; i++) {
    const ent = entsInput[i];

    if (!ent.feature_id) {
      throw new RecaseError({
        code: ErrCode.InvalidEntitlement,
        message: `Feature ID is required for entitlement`,
        statusCode: 400,
      });
    }

    const feature = validateEntitlement(ent, features);

    const existingEnt = featureToEnt[feature.internal_id!];
    if (existingEnt && compareEnts(existingEnt, ent)) {
      continue;
    }

    customEnts.push({
      feature_id: feature.id,
      id: generateId("ent"),
      created_at: Date.now(),
      internal_feature_id: feature.internal_id,
      is_custom: true,

      // custom entitlements stuff..
      allowance: ent.allowance,
      allowance_type: ent.allowance_type,
      interval: ent.interval,
    });
    delete featureToEnt[feature.internal_id!];
  }

  const defaultEnts = Object.values(featureToEnt);
  return { defaultEnts, customEnts };
};

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
  const { defaultPrices, customPrices, newPricesInput } =
    getDefaultAndCustomPrices({
      product,
      pricesInput,
    });

  const { defaultEnts, customEnts } = getDefaultAndCustomEnts({
    product,
    entsInput,
    features,
  });

  const prices = [...defaultPrices, ...customPrices];
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

export const getFullCusProductData = async ({
  sb,
  customerId,
  productId,
  orgId,
  pricesInput,
  entsInput,
  env,
  optionsListInput,
}: {
  sb: SupabaseClient;
  customerId: string;
  productId: string;
  orgId: string;
  pricesInput: PricesInput;
  entsInput: Entitlement[];
  env: AppEnv;
  optionsListInput: FeatureOptions[];
}) => {
  // 1. Get customer, product, org & features
  const { customer, fullProduct, org } = await getCustomerProductAndOrg({
    sb,
    customerId,
    productId,
    orgId,
    env,
  });

  if (!customer) {
    throw new RecaseError({
      message: "Customer not found",
      code: ErrCode.CustomerNotFound,
      statusCode: 400,
    });
  }

  if (!fullProduct) {
    throw new RecaseError({
      message: "Product not found",
      code: ErrCode.ProductNotFound,
      statusCode: 400,
    });
  }

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

  const { prices, entitlements } = await processPricesAndEntsInput({
    sb,
    product: fullProduct,
    pricesInput,
    entsInput,
    features,
  });

  return {
    customer,
    product: fullProduct,
    org,
    prices,
    entitlements,
    features,
    optionsList: newOptionsList,
  };
};
