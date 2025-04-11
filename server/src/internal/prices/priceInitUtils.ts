import RecaseError from "@/utils/errorUtils.js";
import {
  compareObjects,
  generateId,
  notNullish,
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
import { pricesHaveSameFeature } from "./usagePriceUtils.js";

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

export const pricesAreSame = (
  price1: Price,
  price2: Price,
  logDifferences = false
) => {
  // if (price1.name !== price2.name) return false;

  const config1 = price1.config!;
  const config2 = price2.config!;
  // if (config1.type !== config2.type) return false; // shouldn't be able to change, but just in case...

  if (config1.type === PriceType.Fixed) {
    const fixedConfig1 = FixedPriceConfigSchema.parse(config1);
    const fixedConfig2 = FixedPriceConfigSchema.parse(config2);

    // 1. Check amount same
    let diffs = {
      amount: {
        condition: fixedConfig1.amount !== fixedConfig2.amount,
        message: `Amount different: ${fixedConfig1.amount} !== ${fixedConfig2.amount}`,
      },
      interval: {
        condition: fixedConfig1.interval !== fixedConfig2.interval,
        message: `Interval different: ${fixedConfig1.interval} !== ${fixedConfig2.interval}`,
      },
    };

    let pricesAreDiff = Object.values(diffs).some((d) => d.condition);

    if (pricesAreDiff) {
      console.log("Fixed price different");
      console.log(
        "Differences:",
        Object.values(diffs)
          .filter((d) => d.condition)
          .map((d) => d.message)
      );
    }

    return !pricesAreDiff;
  } else {
    const usageConfig1 = UsagePriceConfigSchema.parse(config1);
    const usageConfig2 = UsagePriceConfigSchema.parse(config2);

    let diffs = {
      should_prorate: {
        condition: usageConfig1.should_prorate !== usageConfig2.should_prorate,
        message: `Should prorate different: ${usageConfig1.should_prorate} !== ${usageConfig2.should_prorate}`,
      },
      bill_when: {
        condition: usageConfig1.bill_when !== usageConfig2.bill_when,
        message: `Bill when different: ${usageConfig1.bill_when} !== ${usageConfig2.bill_when}`,
      },
      billing_units: {
        condition: usageConfig1.billing_units !== usageConfig2.billing_units,
        message: `Billing units different: ${usageConfig1.billing_units} !== ${usageConfig2.billing_units}`,
      },
      interval: {
        condition: usageConfig1.interval !== usageConfig2.interval,
        message: `Interval different: ${usageConfig1.interval} !== ${usageConfig2.interval}`,
      },
      internal_feature_id: {
        condition:
          usageConfig1.internal_feature_id !== usageConfig2.internal_feature_id,
        message: `Internal feature ID different: ${usageConfig1.internal_feature_id} !== ${usageConfig2.internal_feature_id}`,
      },
      feature_id: {
        condition: usageConfig1.feature_id !== usageConfig2.feature_id,
        message: `Feature ID different: ${usageConfig1.feature_id} !== ${usageConfig2.feature_id}`,
      },
      usage_tiers: {
        condition: !compareObjects(
          usageConfig1.usage_tiers,
          usageConfig2.usage_tiers
        ),
        message: `Usage tiers different: ${usageConfig1.usage_tiers.map(
          (t) => `${t.to} (${t.amount})`
        )} !== ${usageConfig2.usage_tiers.map((t) => `${t.to} (${t.amount})`)}`,
      },
      // stripe_price_id: {
      //   condition:
      //     usageConfig1.stripe_price_id !== usageConfig2.stripe_price_id,
      //   message: `Stripe price ID different: ${usageConfig1.stripe_price_id} !== ${usageConfig2.stripe_price_id}`,
      // },
      // stripe_placeholder_price_id: {
      //   condition:
      //     usageConfig1.stripe_placeholder_price_id !==
      //     usageConfig2.stripe_placeholder_price_id,
      //   message: `Stripe placeholder price ID different: ${usageConfig1.stripe_placeholder_price_id} !== ${usageConfig2.stripe_placeholder_price_id}`,
      // },
      // stripe_meter_id: {
      //   condition:
      //     usageConfig1.stripe_meter_id !== usageConfig2.stripe_meter_id,
      //   message: `Stripe meter ID different: ${usageConfig1.stripe_meter_id} !== ${usageConfig2.stripe_meter_id}`,
      // },
      // stripe_product_id: {
      //   condition:
      //     usageConfig1.stripe_product_id !== usageConfig2.stripe_product_id,
      //   message: `Stripe product ID different: ${usageConfig1.stripe_product_id} !== ${usageConfig2.stripe_product_id}`,
      // },
    };

    let pricesAreDiff = Object.values(diffs).some((d) => d.condition);

    if (pricesAreDiff && logDifferences) {
      console.log(`Usage price different: ${usageConfig1.feature_id}`);
      console.log(
        "Differences:",
        Object.values(diffs)
          .filter((d) => d.condition)
          .map((d) => d.message)
      );
    }

    return !pricesAreDiff;
  }
};

const initPrice = ({
  price,
  orgId,
  internalProductId,
  isCustom = false,
  keepStripePrice = false,
}: {
  price: Price;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
  keepStripePrice?: boolean;
}): Price => {
  const priceSchema = CreatePriceSchema.parse(price);

  let curConfig = price.config! as UsagePriceConfig;
  let curStripePriceId = curConfig.stripe_price_id;
  let curPlaceholderPriceId = curConfig.stripe_placeholder_price_id;

  // TO RESET STRIPE PRICES
  const newConfig = {
    ...price.config,
    // stripe_meter_id: null,
    stripe_price_id: keepStripePrice ? curStripePriceId : null,
    stripe_placeholder_price_id: keepStripePrice ? curPlaceholderPriceId : null,
  };

  return {
    ...priceSchema,
    config: newConfig as any,
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
  newVersion = false,
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
  newVersion?: boolean;
}) => {
  if (!newPrices) {
    return;
  }

  // Check if feature is valid
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
    if (
      (curPrice && !pricesAreSame(curPrice, newPrice) && isCustom) ||
      (curPrice && newVersion)
    ) {
      createdPrices.push(
        initPrice({
          // price: CreatePriceSchema.parse(newPrice),
          price: newPrice,
          orgId,
          internalProductId,
          isCustom,
          keepStripePrice: newVersion && pricesAreSame(curPrice, newPrice),
        })
      );
      removedPrices.push(curPrice);
    }

    // 2b. Updating price
    if (curPrice && !pricesAreSame(curPrice, newPrice) && !isCustom) {
      let newConfig = {
        ...newPrice.config,
        stripe_price_id: null,
        stripe_placeholder_price_id: null,
      };

      updatedPrices.push({
        ...newPrice,
        billing_type: getBillingType(newPrice.config!),
        config: newConfig as any,
      });
    }
  }

  const hasUpdate =
    updatedPrices.length > 0 ||
    removedPrices.length > 0 ||
    createdPrices.length > 0;

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

  if (!isCustom && !newVersion) {
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
