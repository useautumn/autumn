import { generateId } from "@/utils/genUtils.js";
import {
  FullCustomerEntitlement,
  InsertReplaceable,
  InsertReplaceableSchema,
  OnDecrease,
  Price,
} from "@autumn/shared";

export const getReplaceables = ({
  cusEnt,
  prevOverage,
  newOverage,
  deleteNextCycle = true,
}: {
  cusEnt: FullCustomerEntitlement;
  prevOverage: number;
  newOverage: number;
  deleteNextCycle?: boolean;
}): InsertReplaceable[] => {
  if (prevOverage <= newOverage) {
    return [];
  }

  let numReplaceables = prevOverage - newOverage;
  let newReplaceables = Array.from({ length: numReplaceables }, (_, i) =>
    InsertReplaceableSchema.parse({
      id: generateId("rep"),
      cus_ent_id: cusEnt.id,
      created_at: Date.now(),
      delete_next_cycle: deleteNextCycle,
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
