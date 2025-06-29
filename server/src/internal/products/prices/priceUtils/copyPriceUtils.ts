import { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "../PriceService.js";
import { prices } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import { Price, UsagePriceConfig } from "@autumn/shared";

export const copyPrice = async ({
  db,
  priceId,
  usagePriceConfig,
  isCustom,
}: {
  db: DrizzleCli;
  priceId: string;
  usagePriceConfig?: Partial<UsagePriceConfig>;
  isCustom?: boolean;
}) => {
  let price = (await db.query.prices.findFirst({
    where: eq(prices.id, priceId),
  })) as Price;

  let newPrice = structuredClone(price);

  newPrice = {
    ...newPrice,
    id: generateId("pr"),
    created_at: Date.now(),
    is_custom: isCustom || newPrice.is_custom,
  };

  if (usagePriceConfig) {
    newPrice = {
      ...newPrice,
      config: {
        ...(newPrice.config as UsagePriceConfig),
        ...usagePriceConfig,
      },
    };
  }

  return newPrice;
};
