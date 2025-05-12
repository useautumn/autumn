import { fullCusProductToProduct } from "@/internal/customers/products/cusProductUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  isFreeProduct,
  isOneOff,
  isProductUpgrade,
  sortProductsByPrice,
} from "@/internal/products/productUtils.js";
import { getProductResponse } from "@/internal/products/productV2Utils.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  Feature,
  FeaturePreviewScenario,
  FullCusProduct,
  FullProduct,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export const getCheckPreview = async ({
  sb,
  allowed,
  balance,
  feature,
  cusProducts,
  raw = false,
  allFeatures,
}: {
  sb: SupabaseClient;
  allowed: boolean;
  balance?: number;
  feature: Feature;
  cusProducts: FullCusProduct[];
  raw?: boolean;
  allFeatures: Feature[];
}) => {
  if (allowed) {
    return null;
  }

  let mainCusProds = cusProducts.filter(
    (cp: FullCusProduct) => !cp.product.is_add_on
  );

  let cusOwnedProducts = mainCusProds.map((cp: FullCusProduct) =>
    fullCusProductToProduct(cp)
  );
  sortProductsByPrice(cusOwnedProducts);
  let highestTierProd =
    cusOwnedProducts.length > 0 ? cusOwnedProducts[0] : null;

  let products: FullProduct[] = await ProductService.getByFeature({
    sb,
    internalFeatureId: feature.internal_id!,
  });

  // 1. Get add ons
  let addOns = [];
  for (let addOn of products) {
    if (addOn.is_add_on) {
      if (isOneOff(addOn.prices)) {
        addOns.push(addOn);
      } else if (
        !cusProducts.some((cp: FullCusProduct) => cp.product.id == addOn.id)
      ) {
        addOns.push(addOn);
      }
    }
  }

  let mainProds: FullProduct[] = [];
  if (!highestTierProd) {
    mainProds = products.filter((product: FullProduct) => !product.is_add_on);
  } else {
    for (let prod of products) {
      if (prod.is_add_on) {
        continue;
      }
      if (mainCusProds.some((cp: FullCusProduct) => cp.product.id == prod.id)) {
        continue;
      } else if (
        isProductUpgrade({
          prices1: highestTierProd.prices,
          prices2: prod.prices,
          usageAlwaysUpgrade: false,
        })
      ) {
        mainProds.push(prod);
      }
    }
  }

  if (mainProds.length === 0 && addOns.length === 0) {
    return {
      message: notNullish(balance)
        ? `You have run out of ${feature.name}. Please contact us to get more.`
        : `Your current plan does not include the ${feature.name} feature. Please contact us to get access.`,

      next_action: null,
    };
  }

  let nextProd = mainProds.length > 0 ? mainProds[0] : addOns[0];
  // let curProduct = mainCusProds.find(
  //   (cp: FullCusProduct) => cp.product.group == nextProd.group
  // );

  let title = nextProd.free_trial
    ? `Start trial for ${nextProd.name}`
    : !nextProd.is_add_on
    ? `Upgrade to ${nextProd.name}`
    : `Purchase ${nextProd.name}`;

  // If there's a current balance...
  let msg = "";
  let scenario: FeaturePreviewScenario = FeaturePreviewScenario.FeatureFlag;

  if (notNullish(balance)) {
    scenario = FeaturePreviewScenario.UsageLimit;
    msg = `You have run out of ${feature.name}.`;

    if (mainProds.length > 0) {
      let prodString = `Please upgrade to ${mainProds[0].name} to continue using this feature.`;
      if (addOns.length > 0) {
        prodString += ` Alternatively, you can purchase the ${addOns[0].name} add on.`;
      }
      msg = `${msg} ${prodString}`;
    } else if (addOns.length > 0) {
      let prodString = `Please purchase the ${addOns[0].name} add on to continue using this feature.`;
      msg = `${msg} ${prodString}`;
    }
  }
  // If it will be a new feature...
  else {
    msg = `Your current plan does not include the ${feature.name} feature.`;

    if (mainProds.length > 0) {
      let prodString = `Please upgrade to ${mainProds[0].name} to use this feature.`;
      if (addOns.length > 0) {
        prodString += ` Alternatively, you can purchase the ${addOns[0].name} add on.`;
      }
      msg = `${msg} ${prodString}`;
    } else if (addOns.length > 0) {
      let prodString = `Please purchase the ${addOns[0].name} add on to use this feature.`;
      msg = `${msg} ${prodString}`;
    }
  }

  let rawProducts = [...mainProds, ...addOns];
  for (let p of rawProducts) {
    p.entitlements = p.entitlements.map((e) => ({
      ...e,
      feature: allFeatures.find((f) => f.id == e.feature_id)!,
    }));
  }

  let v2Prods = rawProducts.map((p) =>
    getProductResponse({ product: p, features: allFeatures })
  );

  let nextTier =
    mainProds.length > 0 ? mainProds[0] : addOns.length > 0 ? addOns[0] : null;

  let nextTierResponse = nextTier
    ? getProductResponse({
        product: nextTier,
        features: allFeatures,
      })
    : null;

  // if (raw) {
  //   return {
  //     title,
  //     message: msg,
  //     feature_id: feature.id,
  //     feature_name: feature.name,
  //     products: v2Prods,
  //     // next_tier: nextTierResponse,
  //   };
  // }

  return {
    title,
    message: msg,
    scenario,
    feature_id: feature.id,
    feature_name: feature.name,
    products: v2Prods,
    // next_tier: nextTierResponse,

    // Will depracate
    upgrade_product_id: nextTier?.id || null,
  };
};
