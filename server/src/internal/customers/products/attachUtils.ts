import {
  AppEnv,
  CusProductStatus,
  Customer,
  CustomerData,
  Entitlement,
  EntitlementWithFeature,
  Feature,
  FeatureOptions,
  FreeTrial,
  FullCusProduct,
  Price,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { PricesInput } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import { StatusCodes } from "http-status-codes";
import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { createNewCustomer } from "@/internal/api/customers/cusUtils.js";
import { CusService } from "../CusService.js";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { getPricesForCusProduct } from "../change-product/scheduleUtils.js";

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

const getProducts = async ({
  sb,
  productId,
  productIds,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  productId?: string;
  productIds?: string[];
  orgId: string;
  env: AppEnv;
}) => {
  if (productId && productIds) {
    throw new RecaseError({
      message: `Only one of product_id or product_ids can be provided`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  if (productId) {
    const product = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    return [product];
  }

  if (productIds) {
    // Check for duplicates in productIds
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      throw new RecaseError({
        message: "Not allowed duplicate product ids",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    const products = await ProductService.getFullProducts({
      sb,
      orgId,
      env,
      inIds: productIds,
    });

    if (products.length === 0) {
      throw new RecaseError({
        message: "No products found",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (products.length != productIds.length) {
      // Get product ids that were not found
      throw new RecaseError({
        message:
          "Number of products found does not match number of product ids",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // Check if more than one product has a free trial
    const productsWithFreeTrial = products.filter((p) => p.free_trial !== null);
    if (productsWithFreeTrial.length > 1) {
      throw new RecaseError({
        message: "Cannot attach multiple products with free trials",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // Check that there aren't two products in the same group that are both not add-ons
    for (const product of products) {
      if (product.group && !product.is_add_on) {
        // Find another product in the same group that is not an add-on
        const otherProduct = products.find(
          (p) =>
            p.group === product.group && !p.is_add_on && p.id !== product.id
        );
        if (otherProduct) {
          throw new RecaseError({
            message: `Cannot attach two main products from the same group ${product.group}`,
            code: ErrCode.InvalidRequest,
            statusCode: StatusCodes.BAD_REQUEST,
          });
        }
      }
    }

    return products;
  }

  return [];
};

export const getCustomerProductsFeaturesAndOrg = async ({
  sb,
  customerId,
  customerData,
  productId,
  productIds,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerData?: CustomerData;
  customerId: string;
  productId?: string;
  productIds?: string[];
  orgId: string;
  env: AppEnv;
}) => {
  const getOrg = async () => {
    let fullOrg;
    try {
      fullOrg = await OrgService.getFullOrg({
        sb,
        orgId,
      });
      return fullOrg;
    } catch (error) {
      throw new RecaseError({
        message: `Failed to get organization ${orgId}`,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        code: ErrCode.InternalError,
      });
    }
  };

  const getFeatures = async () => {
    try {
      const features = await FeatureService.getFeatures({
        sb,
        orgId,
        env,
      });
      return features;
    } catch (error) {
      throw new RecaseError({
        message: `Failed to get features for organization ${orgId}`,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        code: ErrCode.InternalError,
      });
    }
  };

  const [customer, products, org, features] = await Promise.all([
    getOrCreateCustomer({
      sb,
      customerId,
      customerData,
      orgId,
      env,
    }),
    getProducts({ sb, productId, productIds, orgId, env }),
    getOrg(),
    getFeatures(),
  ]);

  return { customer, products, org, features };
};

const getEntsWithFeature = (ents: Entitlement[], features: Feature[]) => {
  return ents.map((ent) => ({
    ...ent,
    feature: features.find(
      (f) => f.internal_id === ent.internal_feature_id
    ) as Feature,
  }));
};

export const getFullCusProductData = async ({
  sb,
  customerId,
  customerData,
  productId,
  productIds,
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
  productId?: string;
  productIds?: string[];
  orgId: string;
  pricesInput: PricesInput;
  entsInput: Entitlement[];
  env: AppEnv;
  optionsListInput: FeatureOptions[];
  freeTrialInput: FreeTrial | null;
  isCustom?: boolean;
}) => {
  // 1. Get customer, product, org & features
  const { customer, products, org, features } =
    await getCustomerProductsFeaturesAndOrg({
      sb,
      customerId,
      customerData,
      productId,
      productIds,
      orgId,
      env,
    });

  // Handle existing cus product...
  const cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
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
    let freeTrial = null;
    let freeTrialProduct = products.find((p) => notNullish(p.free_trial));
    if (freeTrialProduct) {
      freeTrial = await getFreeTrialAfterFingerprint({
        sb,
        freeTrial: freeTrialProduct.free_trial,
        fingerprint: customer.fingerprint,
        internalCustomerId: customer.internal_id,
      });
    }

    // Prices, entitlements...

    return {
      customer,
      products,
      org,
      features,
      optionsList: newOptionsList,
      prices: products.map((p) => p.prices).flat() as Price[],
      entitlements: products
        .map((p) => getEntsWithFeature(p.entitlements, features))
        .flat() as EntitlementWithFeature[],
      freeTrial,
      cusProducts,
    };
  }

  if (products.length > 1) {
    throw new RecaseError({
      message: "Cannot attach multiple products when is_custom is true",
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // Get cur main product
  const product = products[0];

  const { curMainProduct } = await getExistingCusProducts({
    product,
    cusProducts,
  });

  let curPrices: Price[] = product!.prices;
  let curEnts: Entitlement[] = product!.entitlements;
  if (curMainProduct?.product.id === product.id) {
    curPrices = getPricesForCusProduct({
      cusProduct: curMainProduct as FullCusProduct,
    });

    curEnts = curMainProduct!.customer_entitlements.map((e) => e.entitlement);
  }

  const entitlements = await handleNewEntitlements({
    sb,
    newEnts: entsInput,
    curEnts,
    internalProductId: product!.internal_id,
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
    curPrices,
    internalProductId: product!.internal_id,
    isCustom,
    features,
    env,
    product: product!,
    org,
    entitlements: entitlementsWithFeature,
  });

  const freeTrial = await handleNewFreeTrial({
    sb,
    curFreeTrial: product!.free_trial,
    newFreeTrial: freeTrialInput || null,
    internalProductId: product!.internal_id,
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
    products,
    org,
    features,
    optionsList: newOptionsList,
    prices: prices as Price[],
    entitlements: entitlementsWithFeature as EntitlementWithFeature[],
    freeTrial: uniqueFreeTrial,
    cusProducts,
  };
};

// UNUSED
// export const getDefaultAndCustomPrices = ({
//   product,
//   pricesInput,
// }: {
//   product: FullProduct;
//   pricesInput: Price[];
// }) => {
//   const idToPrice: { [key: string]: Price } = {};
//   for (const price of product.prices) {
//     idToPrice[price.id!] = price;
//   }

//   const customPrices: Price[] = [];
//   let defaultPrices: Price[] = [...product.prices];

//   for (let i = 0; i < pricesInput.length; i++) {
//     const price = pricesInput[i];

//     const { valid, error } = validatePriceConfig(price as any);
//     if (!valid) {
//       throw new RecaseError({
//         code: ErrCode.InvalidPriceConfig,
//         message: error || "Invalid price config",
//         statusCode: 400,
//       });
//     }

//     // Check if it's existing price
//     const existingPrice = idToPrice[price.id!];
//     const replacePrice =
//       existingPrice && !pricesAreSame(existingPrice, price as any);

//     const createNewPrice = !existingPrice;

//     if (createNewPrice || replacePrice) {
//       // Create new custom price for it...
//       customPrices.push({
//         id: generateId("pr"),
//         name: price.name || "",
//         // org_id: product.org_id,
//         // product_id: product.id,
//         created_at: Date.now(),
//         billing_type: getBillingType(price.config!),

//         config: price.config,
//         is_custom: true,
//       });
//     }

//     if (replacePrice) {
//       defaultPrices = defaultPrices.filter((p) => p.id != existingPrice.id);
//     }
//   }

//   return { defaultPrices, customPrices };
// };

// // GET ENTITLEMENTS
// const validateEntitlement = (ent: Entitlement, features: Feature[]) => {
//   const feature = features.find((f) => ent.feature_id == f.id);
//   if (!feature) {
//     throw new RecaseError({
//       code: ErrCode.FeatureNotFound,
//       message: `Feature ${ent.feature_id} not found`,
//       statusCode: 400,
//     });
//   }

//   if (feature.type == FeatureType.Boolean) {
//     return feature;
//   }

//   if (!ent.allowance_type) {
//     throw new RecaseError({
//       code: ErrCode.InvalidEntitlement,
//       message: `Allowance type is required for feature ${ent.feature_id}`,
//       statusCode: 400,
//     });
//   }

//   if (ent.allowance_type == AllowanceType.Fixed) {
//     if (!ent.allowance || ent.allowance <= 0) {
//       throw new RecaseError({
//         code: ErrCode.InvalidEntitlement,
//         message: `Allowance is required for feature ${ent.feature_id}`,
//         statusCode: 400,
//       });
//     }

//     if (!ent.interval) {
//       throw new RecaseError({
//         code: ErrCode.InvalidEntitlement,
//         message: `Interval is required for feature ${ent.feature_id}`,
//         statusCode: 400,
//       });
//     }
//   }

//   return feature;
// };

// const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
//   if (ent1.allowance_type != ent2.allowance_type) return false;
//   if (ent1.allowance_type == AllowanceType.Fixed) {
//     if (ent1.allowance != ent2.allowance) return false;
//     if (ent1.interval != ent2.interval) return false;
//   }

//   return true;
// };

// export const getDefaultAndCustomEnts = ({
//   product,
//   entsInput,
//   features,
//   prices,
// }: {
//   product: FullProduct;
//   features: Feature[];
//   entsInput: Entitlement[];
//   prices: Price[];
// }) => {
//   let defaultEnts = [...product.entitlements];
//   const featureToEnt: { [key: string]: Entitlement } = {};
//   for (const ent of defaultEnts) {
//     featureToEnt[ent.feature_id!] = ent;
//   }

//   const customEnts: any = [];

//   for (const ent of entsInput) {
//     // 1. Validate entitlement
//     if (!validateEntitlement(ent, features)) {
//       throw new RecaseError({
//         code: ErrCode.InvalidEntitlement,
//         message: `Invalid entitlement`,
//         statusCode: 400,
//       });
//     }

//     const feature = features.find((f) => f.id == ent.feature_id);
//     const existingEnt = featureToEnt[ent.feature_id!];
//     const replaceEnt = existingEnt && !entsAreSame(existingEnt, ent);
//     const createNewEnt = !existingEnt;

//     let newId = generateId("ent");

//     // 3. If replaceEnt, remove from defaultEnts and update related price
//     if (replaceEnt) {
//       let relatedPriceIndex = prices.findIndex(
//         (p) =>
//           p.config &&
//           "entitlement_id" in p.config &&
//           p.config?.entitlement_id == existingEnt.id
//       );

//       if (relatedPriceIndex != -1) {
//         // @ts-ignore
//         prices[relatedPriceIndex].config!.entitlement_id = newId;
//       }
//     }

//     // 4. If new ent, push to customEnts
//     if (createNewEnt || replaceEnt) {
//       customEnts.push({
//         id: newId,

//         created_at: Date.now(),
//         feature_id: ent.feature_id,
//         internal_feature_id: feature!.internal_id,
//         is_custom: true,

//         allowance_type: ent.allowance_type,
//         allowance: ent.allowance,
//         interval: ent.interval,
//       });

//       defaultEnts = defaultEnts.filter(
//         (e) => e.feature_id != existingEnt.feature_id
//       );
//     }
//   }

//   return { defaultEnts, customEnts };
// };

// // PROCESS PRICES AND ENTITLEMENTS
// export const processPricesAndEntsInput = async ({
//   sb,
//   product,
//   pricesInput,
//   entsInput,
//   features,
// }: {
//   sb: SupabaseClient;
//   product: FullProduct;
//   pricesInput: PricesInput;
//   entsInput: Entitlement[];
//   features: Feature[];
// }) => {
//   // 1. Get prices and entitlements
//   const { defaultPrices, customPrices } = getDefaultAndCustomPrices({
//     product,
//     pricesInput,
//   });

//   const prices = [...defaultPrices, ...customPrices];

//   const { defaultEnts, customEnts } = getDefaultAndCustomEnts({
//     product,
//     entsInput,
//     features,
//     prices,
//   });

//   const entitlements = [...defaultEnts, ...customEnts];

//   if (customEnts.length > 0) {
//     console.log("Inserting custom entitlements");
//     await EntitlementService.insert({ sb, data: customEnts });
//   }

//   if (customPrices.length > 0) {
//     console.log("Inserting custom prices");
//     await PriceService.insert({ sb, data: customPrices });
//   }

//   const entsWithFeature = entitlements.map((ent) => ({
//     ...ent,
//     feature: features.find((f) => f.internal_id === ent.internal_feature_id),
//   }));

//   return { prices, entitlements: entsWithFeature };
// };

// export const processEntsInput = async ({
//   sb,
//   product,
//   entsInput,
// }: {
//   sb: SupabaseClient;
//   product: FullProduct;
//   entsInput: Entitlement[];
// }) => {
//   const productEnts = [...product.entitlements];
//   const featureToEnt: { [key: string]: Entitlement } = {};
//   for (const ent of productEnts) {
//     featureToEnt[ent.feature_id!] = ent;
//   }

//   for (const ent of entsInput) {
//     // 1. Handle changed entitlements
//     if (featureToEnt[ent.feature_id!]) {
//       // Check if config is the same
//       if (entsAreSame(featureToEnt[ent.feature_id!], ent)) {
//         continue;
//       }
//     }
//   }
// };
