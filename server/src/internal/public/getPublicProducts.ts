import {
  AllowanceType,
  BillingInterval,
  BillingType,
  Feature,
  FixedPriceConfig,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { Router } from "express";
import { FeatureType } from "@autumn/shared";
import { isFreeProduct, isProductUpgrade } from "../products/productUtils.js";
import { ProductService } from "../products/ProductService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { FullProduct, PriceType, PublicProductSchema } from "@autumn/shared";
import { z } from "zod";
import getSymbolFromCurrency from "currency-symbol-map";
import { keyToTitle } from "@/utils/genUtils.js";
import { getBillingType } from "../prices/priceUtils.js";
import { getEntRelatedPrice } from "../products/entitlements/entitlementUtils.js";

const publicProductsRouter = Router();

// PricingPlanSchema
const MainPriceSchema = z.object({
  amount: z.string(),
  interval: z.string().nullable(),
});

const PricingPlanSchema = z.object({
  name: z.string(),
  id: z.string(),
  is_add_on: z.boolean(),

  // Entitlements String
  main_price: MainPriceSchema,
  entitlements: z.any(),
});

// 1. Sort by upgrade / downgrade
const sortProducts = (products: any[]) => {
  products.sort((a: FullProduct, b: FullProduct) => {
    const isUpgrade = isProductUpgrade(a, b);
    if (isUpgrade) {
      return -1;
    }

    return 1;
  });
};

function formatNumber(num: number) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num;
}

const getPriceString = (currency: string, feature: Feature, price: Price) => {
  const config = price.config as UsagePriceConfig;

  const symbol = getSymbolFromCurrency(currency.toUpperCase());

  // Format amount
  if (config.type == PriceType.Usage) {
    let priceStr = `${symbol}${config.usage_tiers[0].amount.toString()}`;

    let billingUnits = config.billing_units!;
    let formattedAmount = formatNumber(config.billing_units!);
    if (billingUnits > 1) {
      priceStr += ` / ${formattedAmount} ${feature.name}`;
    } else {
      priceStr += ` / ${feature.name}`;
    }

    return priceStr;
  } else {
    let config = price.config as FixedPriceConfig;
    return `${symbol}${config.amount.toString()}`;
  }
};

// 1. Get main price
const getMainPrice = (
  product: FullProduct,
  defaultCurrency: string,
  features: Feature[]
) => {
  // If is free
  if (isFreeProduct(product.prices)) {
    return {
      amount: "Free",
      feature_id: null,
      interval: null,
    };
  }

  const fixedPrice = product.prices.find(
    (p: Price) => p.config?.type === PriceType.Fixed
  );

  let result: any = {
    amount: "Custom",
    interval: null,
    feature_id: null,
  };

  if (fixedPrice) {
    const config = fixedPrice.config as FixedPriceConfig;

    result.amount = config.amount.toString();

    if (config.interval != BillingInterval.OneOff) {
      result.interval = `/ ${keyToTitle(config.interval)}`;
    }
  } else {
    const usagePrice = product.prices.find(
      (p: Price) => p.config?.type === PriceType.Usage
    );

    if (usagePrice) {
      const config = usagePrice.config as UsagePriceConfig;

      result.amount =
        config.usage_tiers.length > 1
          ? `From ${config.usage_tiers[0].amount.toString()}`
          : config.usage_tiers[0].amount.toString();

      // If it's seat based
      const feature = features.find(
        (f) => f.id == config.feature_id
      ) as Feature;
      const billingType = getBillingType(config);

      let billingUnits = config.billing_units!;
      if (billingUnits > 1) {
        result.interval = `/ ${billingUnits} ${feature.name}`;
      } else {
        result.interval = `/ ${feature.name}`;
      }

      if (billingType == BillingType.UsageInAdvance) {
        if (config.interval != BillingInterval.OneOff) {
          result.interval += ` / ${keyToTitle(config.interval!)}`;
        }
      }

      result.feature_id = feature.id;
    }
  }

  const currency = defaultCurrency ? defaultCurrency : "usd";
  const symbol = getSymbolFromCurrency(currency.toUpperCase());
  result.amount = `${symbol}${result.amount}`;

  return result;
};

// 2. Process main products
const processProduct = (org: Organization, product: FullProduct) => {
  // 1. Get main price
  const features = product.entitlements.map((e) => e.feature);

  // 1. Get main price
  const mainPrice = getMainPrice(product, org.default_currency, features);

  // 2. Get entitlements
  let entStrings = product.entitlements.map((e) => {
    let entString = "";

    // Case 1: Boolean
    if (e.feature.type == FeatureType.Boolean) {
      return {
        value: `${e.feature.name}`,
        feature_id: e.feature.id,
      };
    }

    // Case 2: Metered, no usage price
    const relatedPrice = getEntRelatedPrice(e, product.prices);
    let formattedAllowance = formatNumber(e.allowance!);
    if (!relatedPrice) {
      if (e.allowance_type == AllowanceType.Unlimited) {
        entString += `Unlimited `;
      } else if (e.allowance && e.allowance > 0) {
        entString += `${formattedAllowance} `;
      }

      entString += `${e.feature.name}`;
    } else {
      // Related price
      let allowance = e.allowance!;

      if (e.allowance_type == AllowanceType.Unlimited) {
        entString += `Unlimited ${e.feature.name}`;
      } else if (allowance > 0) {
        entString += `${formattedAllowance} ${e.feature.name}`;
        let priceStr = getPriceString(
          org.default_currency,
          e.feature,
          relatedPrice
        );

        entString += `, then ${priceStr}`;
      } else {
        let priceStr = getPriceString(
          org.default_currency,
          e.feature,
          relatedPrice
        );

        entString += `${priceStr}`;
      }
    }

    return {
      value: entString,
      feature_id: e.feature.id,
      related_price: relatedPrice,
    };
  });

  entStrings = entStrings.filter(
    (e: any) => e.feature_id !== mainPrice.feature_id
  );

  return PricingPlanSchema.parse({
    name: product.name,
    id: product.id,
    is_add_on: product.is_add_on,

    entitlements: entStrings,
    main_price: mainPrice,
  });
};

const sortProductPrices = (products: FullProduct[]) => {
  // 1. Sort prices
  for (let i = 0; i < products.length; i++) {
    products[i].prices.sort((a: Price, b: Price) => {
      const billingTypeOrder = [
        BillingType.OneOff,
        BillingType.FixedCycle,
        BillingType.UsageInAdvance,
        BillingType.UsageInArrear,
      ];

      const aBillingType = getBillingType(a.config as UsagePriceConfig);
      const bBillingType = getBillingType(b.config as UsagePriceConfig);

      const aIndex = billingTypeOrder.indexOf(aBillingType);
      const bIndex = billingTypeOrder.indexOf(bBillingType);

      return aIndex - bIndex;
    });
  }
};

publicProductsRouter.get("", async (req: any, res: any) => {
  try {
    const org = req.org;

    const products = await ProductService.getFullProducts({
      sb: req.sb,
      orgId: req.org.id,
      env: req.env,
    });

    // 1. Sort prices
    sortProductPrices(products);

    // 1. Process products
    const features = products.flatMap((p) =>
      p.entitlements.map((e: any) => e.feature)
    );
    const processedProducts = products.map((p) => processProduct(org, p));
    const mainProducts = processedProducts.filter((p) => !p.is_add_on);

    // 2. Sort entitlements
    // First count all features
    const featureCounts: any = {};
    for (const product of mainProducts) {
      for (const entitlement of product.entitlements) {
        featureCounts[entitlement.feature_id] =
          (featureCounts[entitlement.feature_id] || 0) + 1;
      }
    }

    for (let i = 0; i < processedProducts.length; i++) {
      const processedProduct = processedProducts[i];

      // 1. get feature counts
      processedProduct.entitlements.sort((a: any, b: any) => {
        const aFeature = features.find((f) => f.id == a.feature_id);
        const bFeature = features.find((f) => f.id == b.feature_id);

        const aFeatureCount = featureCounts[a.feature_id];
        const bFeatureCount = featureCounts[b.feature_id];

        if (aFeatureCount !== bFeatureCount) {
          return bFeatureCount - aFeatureCount;
        }

        let aIsMetered = aFeature.type == FeatureType.Metered;
        let bIsMetered = bFeature.type == FeatureType.Metered;

        if (aIsMetered && !bIsMetered) {
          return -1;
        }

        if (!aIsMetered && bIsMetered) {
          return 1;
        }

        return aFeature.name.localeCompare(bFeature.name);
      });
    }

    const addOnProducts = processedProducts.filter((p) => p.is_add_on);

    // Lastly: sort by upgrade / downgrade
    // sortProducts(mainProducts);

    res.status(200).json({
      products: mainProducts,
      add_ons: addOnProducts,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Get public products" });
  }
});

export default publicProductsRouter;
