import {
  AppEnv,
  BillingType,
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
  ProductItem,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { PricesInput } from "@autumn/shared";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import { StatusCodes } from "http-status-codes";
import { CusService } from "../CusService.js";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { getPricesForCusProduct } from "../change-product/scheduleUtils.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { getOrCreateCustomer } from "@/internal/api/customers/cusUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { Decimal } from "decimal.js";

const getOrCreateCustomerAndProducts = async ({
  sb,
  customerId,
  customerData,
  orgId,
  env,
  logger,
}: {
  sb: SupabaseClient;
  customerId: string;
  customerData?: CustomerData;
  orgId: string;
  env: AppEnv;
  logger: any;
}) => {
  const customer = await getOrCreateCustomer({
    sb,
    orgId,
    env,
    customerId,
    customerData,
    logger,
  });
  // let customer = await CusService.getByIdOrInternalId({
  //   sb,
  //   idOrInternalId: customerId,
  //   orgId,
  //   env,
  //   // isFull: true,
  // });

  // if (!customer) {
  //   logger.info(`no customer found, creating new`, { customerData });
  //   customer = await createNewCustomer({
  //     sb,
  //     orgId,
  //     env,
  //     customer: {
  //       id: customerId,
  //       name: customerData?.name || "",
  //       email: customerData?.email || "",
  //       fingerprint: customerData?.fingerprint,
  //     },
  //     logger,
  //   });
  // }

  // Handle existing cus product...
  const cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
    logger,
  });

  return { customer, cusProducts };
};

const getProducts = async ({
  sb,
  productId,
  productIds,
  orgId,
  env,
  version,
}: {
  sb: SupabaseClient;
  productId?: string;
  productIds?: string[];
  orgId: string;
  env: AppEnv;
  version?: number;
}) => {
  if (productId && productIds) {
    throw new RecaseError({
      message: `Only one of product_id or product_ids can be provided`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  if (productId) {
    const product = await ProductService.getFullProduct({
      sb,
      productId,
      orgId,
      env,
      version,
    });

    return [product];
  }

  if (productIds) {
    if (notNullish(version)) {
      throw new RecaseError({
        message: "Cannot provide version when providing product ids",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

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

const getCustomerProductsFeaturesAndOrg = async ({
  sb,
  customerId,
  customerData,
  productId,
  productIds,
  orgId,
  env,
  logger,
  version,
}: {
  sb: SupabaseClient;
  customerData?: CustomerData;
  customerId: string;
  productId?: string;
  productIds?: string[];
  orgId: string;
  env: AppEnv;
  logger: any;
  version?: number;
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

  const [cusRes, products, org, features] = await Promise.all([
    getOrCreateCustomerAndProducts({
      sb,
      customerId,
      customerData,
      orgId,
      env,
      logger,
    }),
    getProducts({ sb, productId, productIds, orgId, env, version }),
    getOrg(),
    getFeatures(),
  ]);

  return { ...cusRes, products, org, features };
};

const getEntsWithFeature = (ents: Entitlement[], features: Feature[]) => {
  return ents.map((ent) => ({
    ...ent,
    feature: features.find(
      (f) => f.internal_id === ent.internal_feature_id
    ) as Feature,
  }));
};

const mapOptionsList = ({
  optionsListInput,
  features,
  prices,
}: {
  optionsListInput: FeatureOptions[];
  features: Feature[];
  prices: Price[];
}) => {
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

    let quantity = options?.quantity;
    if (!nullish(quantity)) {
      const prepaidPrice = prices.find(
        (p) =>
          getBillingType(p.config!) == BillingType.UsageInAdvance &&
          feature.internal_id ==
            (p.config as UsagePriceConfig).internal_feature_id
      );

      if (!prepaidPrice) {
        throw new RecaseError({
          message: `No prepaid price found for feature ${feature.id}`,
          code: ErrCode.FeatureNotFound,
          statusCode: 400,
        });
      }

      let config = prepaidPrice.config as UsagePriceConfig;

      let dividedQuantity = new Decimal(options.quantity!)
        .div(config.billing_units || 1)
        .ceil()
        .toNumber();

      quantity = dividedQuantity;
    }

    newOptionsList.push({
      ...options,
      internal_feature_id: feature.internal_id,
      quantity,
    });
  }

  return newOptionsList;
};

export const getFullCusProductData = async ({
  sb,
  customerId,
  customerData,
  productId,
  productIds,
  orgId,
  itemsInput,
  env,
  optionsListInput,
  freeTrialInput,
  isCustom = false,
  logger,
  version,
}: {
  sb: SupabaseClient;
  customerId: string;
  customerData?: Customer;
  productId?: string;
  productIds?: string[];
  orgId: string;
  itemsInput: ProductItem[];
  env: AppEnv;
  optionsListInput: FeatureOptions[];
  freeTrialInput: FreeTrial | null;
  isCustom?: boolean;
  logger: any;
  version?: number;
}) => {
  // 1. Get customer, product, org & features
  const { customer, products, org, features, cusProducts } =
    await getCustomerProductsFeaturesAndOrg({
      sb,
      customerId,
      customerData,
      productId,
      productIds,
      orgId,
      env,
      logger,
      version,
    });

  const entities = await EntityService.get({
    sb,
    internalCustomerId: customer.internal_id,
    orgId,
    env,
  });

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

    return {
      customer,
      products,
      org,
      features,
      optionsList: mapOptionsList({
        optionsListInput,
        features,
        prices: products.map((p) => p.prices).flat() as Price[],
      }),
      prices: products.map((p) => p.prices).flat() as Price[],
      entitlements: products
        .map((p) => getEntsWithFeature(p.entitlements, features))
        .flat() as EntitlementWithFeature[],
      freeTrial,
      cusProducts,
      entities,
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
  let curEnts: Entitlement[] = product!.entitlements.map((e: Entitlement) => {
    return {
      ...e,
      feature: features.find((f) => f.internal_id === e.internal_feature_id),
    };
  });

  if (curMainProduct?.product.id === product.id) {
    curPrices = getPricesForCusProduct({
      cusProduct: curMainProduct as FullCusProduct,
    });

    curEnts = curMainProduct!.customer_entitlements.map((e) => e.entitlement);
  }

  let { prices, entitlements } = await handleNewProductItems({
    sb,
    curPrices,
    curEnts,
    newItems: itemsInput,
    features,
    product,
    logger,
    isCustom: true,
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
    optionsList: mapOptionsList({
      optionsListInput,
      features,
      prices,
    }),
    prices: prices as Price[],
    entitlements: entitlements as EntitlementWithFeature[],
    freeTrial: uniqueFreeTrial,
    cusProducts,
    entities,
  };
};
