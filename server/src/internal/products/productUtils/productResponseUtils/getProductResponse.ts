import {
  FullProduct,
  Feature,
  ProductItemResponseSchema,
  ProductResponseSchema,
  FreeTrialResponseSchema,
  FullCustomer,
  ProductItem,
  AttachScenario,
  ProductPropertiesSchema,
  BillingInterval,
  FeatureOptions,
  UsageModel,
  FreeTrial,
  FreeTrialResponse,
  Price,
} from "@autumn/shared";
import { sortProductItems } from "../../pricecn/pricecnUtils.js";
import { getItemType } from "../../product-items/productItemUtils/getItemType.js";
import { mapToProductItems } from "../../productV2Utils.js";
import { getProductItemDisplay } from "./getProductItemDisplay.js";
import { getAttachScenario } from "./getAttachScenario.js";
import { getFreeTrialAfterFingerprint } from "../../free-trials/freeTrialUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { notNullish } from "@/utils/genUtils.js";
import { isFreeProduct, isOneOff } from "../../productUtils.js";
import { getLargestInterval } from "../../prices/priceUtils/priceIntervalUtils.js";
import { itemToPriceOrTiers } from "../../product-items/productItemUtils.js";
import { toAPIFeature } from "@/internal/features/utils/mapFeatureUtils.js";
import { isPrepaidPrice } from "../../prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

export const getProductItemResponse = ({
  item,
  features,
  currency,
  withDisplay = true,
  options,
  isMainPrice = false,
}: {
  item: ProductItem;
  features: Feature[];
  currency?: string | null;
  withDisplay?: boolean;
  options?: FeatureOptions[];
  isMainPrice?: boolean;
}) => {
  // 1. Get item type
  let type = getItemType(item);

  // 2. Get display
  let display = getProductItemDisplay({
    item,
    features,
    currency,
    isMainPrice,
  });

  let priceData = itemToPriceOrTiers({ item });

  let quantity = undefined;
  let upcomingQuantity = undefined;

  if (item.usage_model == UsageModel.Prepaid && notNullish(options)) {
    let option = options!.find((o) => o.feature_id == item.feature_id);
    quantity = option?.quantity
      ? option?.quantity * (item.billing_units ?? 1)
      : undefined;

    upcomingQuantity = option?.upcoming_quantity
      ? option?.upcoming_quantity * (item.billing_units ?? 1)
      : undefined;
  }

  let feature = features.find((f) => f.id == item.feature_id);
  return ProductItemResponseSchema.parse({
    type,
    ...item,
    feature: feature ? toAPIFeature({ feature }) : null,
    display: withDisplay ? display : undefined,
    ...priceData,
    quantity,
    next_cycle_quantity: upcomingQuantity,
  });
};

export const getFreeTrialResponse = async ({
  db,
  product,
  fullCus,
  attachScenario,
}: {
  db?: DrizzleCli;
  product: FullProduct;
  fullCus?: FullCustomer;
  attachScenario: AttachScenario;
}) => {
  if (!db) return product.free_trial;

  if (product.free_trial && fullCus) {
    let trial = await getFreeTrialAfterFingerprint({
      db,
      freeTrial: product.free_trial,
      fingerprint: fullCus.fingerprint,
      internalCustomerId: fullCus.internal_id,
      multipleAllowed: false,
      productId: product.id,
    });

    if (attachScenario == AttachScenario.Downgrade) trial = null;
    return FreeTrialResponseSchema.parse({
      duration: product.free_trial?.duration,
      length: product.free_trial?.length,
      unique_fingerprint: product.free_trial?.unique_fingerprint,
      trial_available: notNullish(trial) ? true : false,
    });
  }

  if (product.free_trial) {
    return FreeTrialResponseSchema.parse({
      duration: product.free_trial?.duration,
      length: product.free_trial?.length,
      unique_fingerprint: product.free_trial?.unique_fingerprint,
    });
  }

  return null;
};

export const getProductProperties = ({
  product,
  freeTrial,
}: {
  product: FullProduct;
  freeTrial?: FreeTrialResponse | null;
}) => {
  const largestInterval = getLargestInterval({
    prices: product.prices,
    excludeOneOff: true,
  });

  let hasFreeTrial =
    notNullish(freeTrial) && freeTrial?.trial_available !== false;

  return ProductPropertiesSchema.parse({
    is_free: isFreeProduct(product.prices) || false,
    is_one_off: isOneOff(product.prices) || false,
    interval_group: largestInterval?.interval,
    has_trial: hasFreeTrial,
    updateable: product.prices.some(
      (p: Price) =>
        isPrepaidPrice({ price: p }) &&
        p.config.interval !== BillingInterval.OneOff
    ),
  });
};

export const getProductResponse = async ({
  product,
  features,
  fullCus,
  currency,
  db,
  withDisplay = true,
  options,
}: {
  product: FullProduct;
  features: Feature[];
  fullCus?: FullCustomer;
  currency?: string | null;
  db?: DrizzleCli;
  withDisplay?: boolean;
  options?: FeatureOptions[];
}) => {
  // 1. Get items with display
  let rawItems = mapToProductItems({
    prices: product.prices,
    entitlements: product.entitlements,
    features: features,
  });

  // Sort raw items first
  let sortedItems = sortProductItems(rawItems, features);

  // Transform sorted items
  let items = sortedItems.map((item, index) => {
    return getProductItemResponse({
      item,
      features,
      currency,
      withDisplay,
      options,
      isMainPrice: index == 0,
    });
  });

  // 2. Get product properties
  let attachScenario = getAttachScenario({
    fullCus,
    fullProduct: product,
  });

  let freeTrial = (await getFreeTrialResponse({
    db: db as DrizzleCli,
    product,
    fullCus,
    attachScenario,
  })) as FreeTrialResponse;

  return ProductResponseSchema.parse({
    ...product,
    name: product.name || null,
    group: product.group || null,
    items: items,
    free_trial: freeTrial || null,
    scenario: attachScenario,
    properties: getProductProperties({ product, freeTrial }),
  });
};
