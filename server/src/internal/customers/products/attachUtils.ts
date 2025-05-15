import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Customer,
  CustomerData,
  Entitlement,
  EntitlementWithFeature,
  Entity,
  Feature,
  FeatureOptions,
  FreeTrial,
  FullCusProduct,
  Organization,
  Price,
  ProductItem,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

import { ErrCode } from "@/errors/errCodes.js";
import RecaseError from "@/utils/errorUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";

import { StatusCodes } from "http-status-codes";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { getPricesForCusProduct } from "../change-product/scheduleUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { Decimal } from "decimal.js";

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

const getCustomerAndProducts = async ({
  sb,
  org,
  customerId,
  customerData,
  productId,
  productIds,

  env,
  logger,
  version,
  entityId,
}: {
  sb: SupabaseClient;
  org: Organization;
  customerData?: CustomerData;
  customerId: string;
  productId?: string;
  productIds?: string[];
  env: AppEnv;
  logger: any;
  version?: number;
  entityId?: string;
}) => {
  const [customer, products] = await Promise.all([
    getOrCreateCustomer({
      sb,
      org,
      env,
      customerId,
      customerData,
      logger,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.Scheduled,
        CusProductStatus.PastDue,
      ],
      entityId,
      withEntities: true,
    }),
    getProducts({ sb, productId, productIds, orgId: org.id, env, version }),
  ]);

  let cusProducts = customer.customer_products;

  return { customer, cusProducts, products };
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
  org,
  features,
  sb,
  customerId,
  customerData,
  productId,
  entityId,
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
  org: Organization;
  features: Feature[];
  sb: SupabaseClient;
  customerId: string;
  customerData?: Customer;
  entityId?: string;
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
  const { customer, products, cusProducts } = await getCustomerAndProducts({
    org,
    sb,
    customerId,
    customerData,
    productId,
    productIds,
    env,
    logger,
    version,
    entityId,
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
        multipleAllowed: org.config.multiple_trials,
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
      entities: customer.entities,
      entityId: entityId,
      internalEntityId: entityId
        ? customer.entities.find(
            (e) => e.id === entityId || e.internal_id === entityId
          )?.internal_id
        : undefined,
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
    multipleAllowed: org.config.multiple_trials,
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
    entities: customer.entities,
    entityId: entityId,
    internalEntityId: entityId
      ? customer.entities.find(
          (e) => e.id === entityId || e.internal_id === entityId
        )?.internal_id
      : undefined,
  };
};
