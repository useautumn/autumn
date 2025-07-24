import {
  CustomerEntitlement,
  EntitlementWithFeature,
  FullCusProduct,
} from "@autumn/shared";

export const getNewProductRollovers = async ({
  curCusProduct,
  cusEnts,
  entitlements,
  logger,
}: {
  curCusProduct: FullCusProduct;
  cusEnts: CustomerEntitlement[];
  entitlements: EntitlementWithFeature[];
  logger: any;
}) => {
  try {
    let newRollovers = [];

    for (const cusEnt of cusEnts) {
      let ent = entitlements.find((e) => e.id === cusEnt.entitlement_id);
      if (!ent?.rollover) continue;

      // 1. Get rollovers from current cus product (Look at feature ID)

      // 2. Cases
      // - Bring over current balance (if greater > 0), and any existing rollover
      // - Perform max clearing according to new entitlement's rollover config (so cusEnt.entitlement.rollover)
      // - To test: entity mode and non-entity mode, upgrade and downgrade
      // - Don't need to handle no entity -> entity or entity -> no entity

      // 3. Perform db operations AFTER insertFullCusProduct later on
    }
  } catch (error) {
    logger.error(`Failed to handle new product rollovers:`, {
      error,
    });
  }
};
