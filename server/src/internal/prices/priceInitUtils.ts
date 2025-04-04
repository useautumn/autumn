import RecaseError from "@/utils/errorUtils.js";
import {
  compareObjects,
  generateId,
  notNullOrUndefined,
} from "@/utils/genUtils.js";
import {
  AllowanceType,
  AppEnv,
  BillingInterval,
  BillingType,
  CreatePrice,
  CreatePriceSchema,
  Entitlement,
  EntitlementWithFeature,
  ErrCode,
  Feature,
  FixedPriceConfig,
  FixedPriceConfigSchema,
  Organization,
  Price,
  PriceType,
  Product,
  UsagePriceConfig,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  getBillingType,
  getPriceEntitlement,
  roundPriceAmounts,
} from "./priceUtils.js";
import { PriceService } from "./PriceService.js";
import { CusProductService } from "../customers/products/CusProductService.js";
import { isFreeProduct } from "../products/productUtils.js";

export const constructPrice = ({
  name,
  config,
  orgId,
  internalProductId,
  isCustom = false,
}: {
  name: string;
  config: UsagePriceConfig | FixedPriceConfig;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
}) => {
  return {
    id: generateId("pr"),
    org_id: orgId,
    internal_product_id: internalProductId,
    created_at: Date.now(),
    billing_type: getBillingType(config),
    is_custom: isCustom,

    name,
    config,
  };
};

// GET PRICES
const validatePrice = (
  price: Price,
  relatedEnt?: Entitlement | undefined | null
) => {
  if (!price.config?.type) {
    throw new RecaseError({
      message: "Missing `type` field in price config",
      code: ErrCode.InvalidPriceConfig,
      statusCode: 400,
    });
  }

  if (price.config?.type == PriceType.Fixed) {
    FixedPriceConfigSchema.parse(price.config);
  } else {
    UsagePriceConfigSchema.parse(price.config);

    const config = price.config! as UsagePriceConfig;

    if (config.usage_tiers.length == 0) {
      throw new RecaseError({
        message: "Usage based prices should have at least one tier",
        code: ErrCode.InvalidPriceConfig,
        statusCode: 400,
      });
    }

    if (relatedEnt?.allowance_type == AllowanceType.Unlimited) {
      if (config.interval == BillingInterval.OneOff) {
        throw new RecaseError({
          message: `Usage-based price cannot have unlimited allowance (${relatedEnt.feature_id})`,
          code: ErrCode.InvalidPriceConfig,
          statusCode: 400,
        });
      }
    }

    const billingType = getBillingType(config);
    if (billingType == BillingType.UsageInArrear) {
      if (config.interval == BillingInterval.OneOff) {
        throw new RecaseError({
          message: "One off prices must be billed at start of period",
          code: ErrCode.InvalidPriceConfig,
          statusCode: 400,
        });
      }
    }
  }

  return {
    valid: true,
    error: null,
  };
};

const pricesAreSame = (price1: Price, price2: Price) => {
  if (price1.name !== price2.name) return false;

  const config1 = price1.config!;
  const config2 = price2.config!;

  if (config1.type !== config2.type) return false;

  if (config1.type === PriceType.Fixed) {
    const fixedConfig1 = FixedPriceConfigSchema.parse(config1);
    const fixedConfig2 = FixedPriceConfigSchema.parse(config2);
    return (
      fixedConfig1.amount === fixedConfig2.amount &&
      fixedConfig1.interval === fixedConfig2.interval
    );
  } else {
    const usageConfig1 = UsagePriceConfigSchema.parse(config1);
    const usageConfig2 = UsagePriceConfigSchema.parse(config2);
    return (
      usageConfig1.should_prorate === usageConfig2.should_prorate &&
      usageConfig1.bill_when === usageConfig2.bill_when &&
      usageConfig1.billing_units === usageConfig2.billing_units &&
      usageConfig1.interval === usageConfig2.interval &&
      usageConfig1.internal_feature_id === usageConfig2.internal_feature_id &&
      usageConfig1.feature_id === usageConfig2.feature_id &&
      usageConfig1.usage_tiers.length === usageConfig2.usage_tiers.length &&
      usageConfig1.usage_tiers.every((tier, index) =>
        compareObjects(tier, usageConfig2.usage_tiers[index])
      )
    );
  }
};

const initPrice = ({
  price,
  orgId,
  internalProductId,
  isCustom = false,
}: {
  price: CreatePrice;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
}): Price => {
  const priceSchema = CreatePriceSchema.parse(price);

  // TO RESET STRIPE PRICES
  const newConfig = {
    ...priceSchema.config,
    stripe_meter_id: null,
    stripe_price_id: null,
    stripe_placeholder_price_id: null,
  };

  return {
    ...priceSchema,
    config: newConfig,
    id: generateId("pr"),
    org_id: orgId,
    internal_product_id: internalProductId,
    created_at: Date.now(),
    billing_type: getBillingType(priceSchema.config),
    is_custom: isCustom,
  };
};

export const handleNewPrices = async ({
  sb,
  newPrices,
  curPrices,
  internalProductId,
  isCustom = false,
  features,
  product,
  org,
  env,
  entitlements,
}: {
  sb: SupabaseClient;
  newPrices: Price[];
  curPrices: Price[];
  internalProductId: string;
  isCustom: boolean;
  features: Feature[];
  product: Product;
  org: Organization;
  env: AppEnv;
  entitlements: Entitlement[];
}) => {
  if (!newPrices) {
    return;
  }

  for (const price of newPrices) {
    let config = price.config! as UsagePriceConfig;
    if (config.feature_id) {
      const feature = features.find((f) => f.id === config.feature_id);
      if (!feature) {
        throw new RecaseError({
          message: `Feature ${config.feature_id} not found for price ${price.name}`,
          code: ErrCode.FeatureNotFound,
          statusCode: 400,
        });
      }
      config.internal_feature_id = feature.internal_id!;
    }
  }

  const orgId = org.id;

  const idToPrice: { [key: string]: Price } = {};
  for (const price of curPrices) {
    idToPrice[price.id!] = price;
  }

  // 1. Deleted entitlements: filter out entitlements that are not in newEnts
  const removedPrices: Price[] = curPrices.filter(
    (price) => !newPrices.some((p: Price) => p.id === price.id)
  );

  const createdPrices: Price[] = [];
  const updatedPrices: Price[] = [];
  let newInArrearPrices: Price[] = [];

  let updatedOrRemovedPrices: Price[] = [];

  for (let newPrice of newPrices) {
    // Validate price

    const relatedEnt = getPriceEntitlement(
      newPrice,
      entitlements as EntitlementWithFeature[]
    );

    validatePrice(newPrice, relatedEnt);
    roundPriceAmounts(newPrice);

    // 1. Handle new price
    if (!newPrice.id) {
      createdPrices.push(
        initPrice({
          price: newPrice as CreatePrice,
          orgId,
          internalProductId,
          isCustom,
        })
      );
    }

    // 2. Handle updated entitlement
    newPrice = newPrice as Price;
    let curPrice = idToPrice[newPrice.id!];

    // 2a. If custom, create new entitlement and remove old one
    if (curPrice && !pricesAreSame(curPrice, newPrice) && isCustom) {
      createdPrices.push(
        initPrice({
          price: CreatePriceSchema.parse(newPrice),
          orgId,
          internalProductId,
          isCustom,
        })
      );
      removedPrices.push(curPrice);
    }

    // 2b. If not customm, update existing entitlement
    if (curPrice && !pricesAreSame(curPrice, newPrice) && !isCustom) {
      let curConfig = curPrice.config! as UsagePriceConfig;
      if (curConfig.stripe_price_id) {
        throw new RecaseError({
          message: `Price "${curPrice.name}" is linked to Stripe and cannot be updated. Try deleting and creating new one.`,
          code: ErrCode.InvalidPriceConfig,
          statusCode: 400,
        });
      }

      updatedPrices.push({
        ...newPrice,
        billing_type: getBillingType(newPrice.config!),
      });
      if (getBillingType(newPrice.config!) == BillingType.UsageInArrear) {
        newInArrearPrices.push(newPrice);
      }

      updatedOrRemovedPrices.push(curPrice);
    }
  }

  const hasUpdate =
    updatedPrices.length > 0 ||
    removedPrices.length > 0 ||
    createdPrices.length > 0;

  if (!isCustom && hasUpdate) {
    const cusProducts = await CusProductService.getByProductId(
      sb,
      internalProductId
    );

    if (cusProducts.length > 0) {
      throw new RecaseError({
        message: "Cannot update prices for product with customers",
        code: ErrCode.ProductHasCustomers,
        statusCode: 400,
      });
    }
  }

  // If product is default, can't have any paid prices
  if (product.is_default && !isCustom) {
    if (
      createdPrices.some(
        (p) => getBillingType(p.config!) == BillingType.UsageInAdvance
      )
    ) {
      throw new RecaseError({
        message:
          "Default product cannot have start of period prices (quantity will be unknown)",
        code: ErrCode.InvalidProduct,
        statusCode: 400,
      });
    }
  }

  await PriceService.insert({ sb, data: createdPrices });

  // For created prices, create Stripe price if not already created

  // 2. Update existing entitlements and delete removed ones
  if (!isCustom) {
    await PriceService.upsert({ sb, data: updatedPrices });

    await PriceService.deleteByIds({
      sb,
      priceIds: removedPrices.map((p) => p.id!),
    });
  }

  if (isCustom) {
    return [
      ...createdPrices,
      ...curPrices.filter((p) => !removedPrices.some((rp) => rp.id === p.id)),
    ];
  }

  console.log(
    `Successfully handled new prices. Created ${createdPrices.length}, updated ${updatedPrices.length}, removed ${removedPrices.length}`
  );
};

// const handleStripePrices = async ({
//   sb,
//   product,
//   prices,
//   org,
//   env,
//   features,
//   entitlements,
// }: {
//   sb: SupabaseClient;
//   product: Product;
//   prices: Price[];
//   org: Organization;
//   env: AppEnv;
//   features: Feature[];
//   entitlements: Entitlement[];
// }) => {
//   // First get features that need a meter

//   // Contains usage in arrear
//   const inArrearExists = prices.some(
//     (p) => getBillingType(p.config!) == BillingType.UsageInArrear
//   );

//   if (!inArrearExists) {
//     return;
//   }

//   const stripeCli = createStripeCli({
//     org,
//     env,
//   });

//   if (!org.stripe_connected) {
//     throw new RecaseError({
//       message: "Stripe connection required for usage-based, end of period",
//       code: ErrCode.StripeConfigNotFound,
//       statusCode: 400,
//     });
//   }

//   for (const price of prices) {
//     const config = price.config! as UsagePriceConfig;
//     const billingType = getBillingType(config);

//     // If price.config.meter_id and stripe_price_id, delete

//     if (billingType == BillingType.UsageInArrear) {
//       if (!config.stripe_price_id) {
//         const feature = features.find(
//           (f) => f.internal_id === config.internal_feature_id
//         );

//         const meter = await stripeCli.billing.meters.create({
//           display_name: `${product.name} - ${feature!.name}`,
//           event_name: price.id!,
//           default_aggregation: {
//             formula: "sum",
//           },
//         });

//         const stripePrice = await createStripeMeteredPrice({
//           stripeCli,
//           product,
//           price,
//           entitlements,
//           feature: feature!,
//           meterId: meter.id,
//         });

//         let newUsageConfig = {
//           ...config,
//           stripe_meter_id: meter.id,
//           stripe_price_id: stripePrice.id,
//         };

//         price.config = newUsageConfig;
//       } else {
//         // Update price
//         // Set old price to inactive
//         await stripeCli.prices.update(config.stripe_price_id, {
//           active: false,
//         });

//         const feature = features.find(
//           (f) => f.internal_id === config.internal_feature_id
//         );

//         const stripePrice = await createStripeMeteredPrice({
//           stripeCli,
//           product,
//           price,
//           entitlements,
//           feature: feature!,
//           meterId: config.stripe_meter_id!,
//         });

//         config.stripe_price_id = stripePrice.id;
//       }
//     }
//   }
// };

// const deleteStripePrices = async ({
//   sb,
//   prices,
//   org,
//   env,
// }: {
//   sb: SupabaseClient;
//   prices: Price[];
//   org: Organization;
//   env: AppEnv;
// }) => {
//   const deleteExists = prices.some((p) => {
//     const config = p.config! as UsagePriceConfig;
//     return notNullOrUndefined(config.stripe_price_id);
//   });

//   if (!deleteExists) {
//     return;
//   }
//   const stripeCli = createStripeCli({
//     org,
//     env,
//   });

//   for (const price of prices) {
//     const config = price.config! as UsagePriceConfig;

//     if (config.stripe_price_id) {
//       try {
//         const stripePrice = await stripeCli.prices.retrieve(
//           config.stripe_price_id!
//         );

//         await stripeCli.prices.update(config.stripe_price_id!, {
//           active: false,
//         });

//         const attachedProductId = stripePrice.product as string;
//         const product = await stripeCli.products.retrieve(attachedProductId);

//         if (!product.active) {
//           await stripeCli.products.del(attachedProductId);
//         } else {
//           await stripeCli.products.update(attachedProductId, {
//             active: false,
//           });
//         }

//         console.log("Deleted stripe price:", config.stripe_price_id);
//       } catch (error: any) {
//         console.log("Error deleting stripe price / product:", error.message);
//       }
//     }

//     if (config.stripe_meter_id) {
//       try {
//         await stripeCli.billing.meters.deactivate(config.stripe_meter_id!);
//         console.log("Deleted stripe meter:", config.stripe_meter_id);
//       } catch (error: any) {
//         console.log("Error deactivating meter:", error.message);
//       }
//     }

//     // if (getBillingType(price.config!) == BillingType.UsageInArrear) {

//     // }
//   }
// };
