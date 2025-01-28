import { formatZodError } from "@/utils/errorUtils.js";
import { compareObjects, generateId } from "@/utils/genUtils.js";
import {
  CreatePrice,
  CreatePriceSchema,
  FixedPriceConfigSchema,
  Price,
  PriceType,
  UsagePriceConfigSchema,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getBillingType } from "./priceUtils.js";
import { PriceService } from "./PriceService.js";

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
  return (
    price1.name === price2.name && compareObjects(price1.config, price2.config)
  );
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

export const handleNewPrices = async ({
  sb,
  newPrices,
  curPrices,
  orgId,
  internalProductId,
  isCustom = false,
}: {
  sb: SupabaseClient;
  newPrices: Price[];
  curPrices: Price[];
  internalProductId: string;
  orgId: string;
  isCustom: boolean;
}) => {
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
    // Validate entitlement
    validatePrice(newPrice);

    // 1. Handle new entitlement
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
      updatedPrices.push(newPrice);
    }
  }

  // console.log("Created Ents: ", createdEnts);
  // 1. Create new entitlements
  await PriceService.insert({ sb, data: createdPrices });

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
