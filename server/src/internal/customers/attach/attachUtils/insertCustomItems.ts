import { DrizzleCli } from "@/db/initDrizzle.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { Entitlement, Price } from "@autumn/shared";

export const insertCustomItems = async ({
  db,
  customPrices,
  customEnts,
}: {
  db: DrizzleCli;
  customPrices: Price[];
  customEnts: Entitlement[];
}) => {
  await EntitlementService.insert({
    db,
    data: customEnts,
  });

  await PriceService.insert({
    db,
    data: customPrices,
  });
};
