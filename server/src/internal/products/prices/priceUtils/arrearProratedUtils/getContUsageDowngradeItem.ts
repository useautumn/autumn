import { DrizzleCli } from "@/db/initDrizzle.js";
import { handleCreateReplaceables } from "@/trigger/arrearProratedUsage/handleCreateReplaceables.js";
import { generateId } from "@/utils/genUtils.js";
import {
  Feature,
  FullCusEntWithFullCusProduct,
  FullCustomerEntitlement,
  getFeatureInvoiceDescription,
  InsertReplaceableSchema,
  OnDecrease,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import Decimal from "decimal.js";

export const getReplaceables = ({
  cusEnt,
  prevOverage,
  newOverage,
}: {
  cusEnt: FullCustomerEntitlement;
  prevOverage: number;
  newOverage: number;
}) => {
  if (prevOverage <= newOverage) {
    return;
  }

  let numReplaceables = prevOverage - newOverage;
  let newReplaceables = Array.from({ length: numReplaceables }, (_, i) =>
    InsertReplaceableSchema.parse({
      id: generateId("rep"),
      cus_ent_id: cusEnt.id,
      created_at: Date.now(),
      delete_next_cycle: true,
    }),
  );

  return newReplaceables;
};

export const getContUsageDowngradeItem = ({
  price,
  cusEnt,
  prevOverage,
  newOverage,
}: {
  price: Price;
  cusEnt: FullCustomerEntitlement;
  prevOverage: number;
  newOverage: number;
}) => {
  let noProration = price.proration_config?.on_decrease == OnDecrease.None;

  if (noProration) {
    let newReplaceables = getReplaceables({
      cusEnt,
      prevOverage,
      newOverage,
    });

    // let description = getFeatureInvoiceDescription({
    //   feature,
    //   usage: newRoundedUsage,
    //   billingUnits: (price.config as UsagePriceConfig).billing_units,
    //   prodName: product.name,
    // });

    return {
      newReplaceables,
      amount: null,
    };
  } else {
  }

  // let shouldProrate =
  //   price.config.proration_config?.on_decrease == OnDecrease.Prorate;

  // if (shouldProrate) {
  //   invoice = await createDowngradeProrationInvoice({
  //     org,
  //     cusPrice,
  //     stripeCli,
  //     sub,
  //     newPrice,
  //     prevPrice,
  //     newRoundedUsage,
  //     feature,
  //     product,
  //     onDecrease,
  //     logger,
  //   });
  // }
};
