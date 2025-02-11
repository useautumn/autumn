import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { compareObjects, generateId } from "@/utils/genUtils.js";
import {
  AppEnv,
  BillingType,
  CreatePrice,
  CreatePriceSchema,
  Entitlement,
  ErrCode,
  Feature,
  FixedPriceConfigSchema,
  Organization,
  Price,
  PriceType,
  Product,
  UsagePriceConfig,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getBillingType, roundPriceAmounts } from "./priceUtils.js";
import { PriceService } from "./PriceService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { createStripeMeteredPrice } from "@/external/stripe/stripePriceUtils.js";

// GET PRICES
const validatePrice = (price: Price) => {
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
      usageConfig1.bill_when === usageConfig2.bill_when &&
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

  return {
    ...priceSchema,
    id: generateId("pr"),
    org_id: orgId,
    internal_product_id: internalProductId,
    created_at: Date.now(),
    billing_type: getBillingType(priceSchema.config),
    is_custom: isCustom,
  };
};

const handleStripePrices = async ({
  sb,
  product,
  prices,
  org,
  env,
  features,
  entitlements,
}: {
  sb: SupabaseClient;
  product: Product;
  prices: Price[];
  org: Organization;
  env: AppEnv;
  features: Feature[];
  entitlements: Entitlement[];
}) => {
  // First get features that need a meter

  // Contains usage in arrear
  const inArrearExists = prices.some(
    (p) => getBillingType(p.config!) == BillingType.UsageInArrear
  );

  if (!inArrearExists) {
    return;
  }

  const stripeCli = createStripeCli({
    org,
    env,
  });

  if (!org.stripe_connected) {
    throw new RecaseError({
      message: "Stripe connection required for usage-based, end of period",
      code: ErrCode.StripeConfigNotFound,
      statusCode: 400,
    });
  }

  for (const price of prices) {
    const config = price.config! as UsagePriceConfig;
    const billingType = getBillingType(config);

    // If price.config.meter_id and stripe_price_id, delete

    if (billingType == BillingType.UsageInArrear) {
      if (!config.stripe_price_id) {
        const feature = features.find(
          (f) => f.internal_id === config.internal_feature_id
        );

        const meter = await stripeCli.billing.meters.create({
          display_name: `${product.name} - ${feature!.name}`,
          event_name: price.id!,
          default_aggregation: {
            formula: "sum",
          },
        });

        const stripePrice = await createStripeMeteredPrice({
          stripeCli,
          product,
          price,
          entitlements,
          feature: feature!,
          meterId: meter.id,
        });

        let newUsageConfig = {
          ...config,
          stripe_meter_id: meter.id,
          stripe_price_id: stripePrice.id,
        };

        price.config = newUsageConfig;
      } else {
        // Update price
        // Set old price to inactive
        await stripeCli.prices.update(config.stripe_price_id, {
          active: false,
        });

        const feature = features.find(
          (f) => f.internal_id === config.internal_feature_id
        );

        const stripePrice = await createStripeMeteredPrice({
          stripeCli,
          product,
          price,
          entitlements,
          feature: feature!,
          meterId: config.stripe_meter_id!,
        });

        config.stripe_price_id = stripePrice.id;
      }
    }
  }
};

const deleteStripePrices = async ({
  sb,
  prices,
  org,
  env,
}: {
  sb: SupabaseClient;
  prices: Price[];
  org: Organization;
  env: AppEnv;
}) => {
  const inArrearExists = prices.some(
    (p) => getBillingType(p.config!) == BillingType.UsageInArrear
  );

  if (!inArrearExists) {
    return;
  }
  const stripeCli = createStripeCli({
    org,
    env,
  });

  for (const price of prices) {
    const config = price.config! as UsagePriceConfig;

    if (getBillingType(price.config!) == BillingType.UsageInArrear) {
      if (config.stripe_price_id) {
        const stripePrice = await stripeCli.prices.retrieve(
          config.stripe_price_id!
        );

        // Default product

        await stripeCli.prices.update(config.stripe_price_id!, {
          active: false,
        });

        const attachedProductId = stripePrice.product as string;
        const product = await stripeCli.products.retrieve(attachedProductId);
        if (!product.active) {
          await stripeCli.products.del(attachedProductId);
        } else {
          await stripeCli.products.update(attachedProductId, {
            active: false,
          });
        }
      }

      if (config.stripe_meter_id) {
        await stripeCli.billing.meters.deactivate(config.stripe_meter_id!);
      }
      console.log("Deleted stripe price and meter");
    }
  }
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
  let removedInArrearPrices: Price[] = [];

  for (let newPrice of newPrices) {
    // Validate price
    validatePrice(newPrice);
    roundPriceAmounts(newPrice);

    // 1. Handle new price
    if (!("id" in newPrice)) {
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
      updatedPrices.push({
        ...newPrice,
        billing_type: getBillingType(newPrice.config!),
      });
      if (getBillingType(newPrice.config!) == BillingType.UsageInArrear) {
        newInArrearPrices.push(newPrice);
      }

      if (
        getBillingType(curPrice.config!) == BillingType.UsageInArrear &&
        getBillingType(newPrice.config!) != BillingType.UsageInArrear
      ) {
        removedInArrearPrices.push(curPrice);
      }
    }
  }

  // Handle new in arrear prices
  newInArrearPrices = [
    ...newInArrearPrices,
    ...createdPrices.filter(
      (p) => getBillingType(p.config!) == BillingType.UsageInArrear
    ),
  ];

  // console.log("Created Ents: ", createdEnts);
  // 1. Create new entitlements
  await handleStripePrices({
    sb,
    product,
    prices: newInArrearPrices,
    org,
    env,
    features,
    entitlements,
  });

  await deleteStripePrices({
    sb,
    prices: [...removedInArrearPrices, ...removedPrices],
    org,
    env,
  });

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
