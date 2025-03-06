import {
  Customer,
  EntitlementWithFeature,
  FeatureOptions,
  FreeTrial,
  FullCusProduct,
  FullProduct,
  Organization,
  Price,
} from "@autumn/shared";

export type AttachParams = {
  customer: Customer;
  products: FullProduct[];

  org: Organization;

  prices: Price[];
  entitlements: EntitlementWithFeature[];

  freeTrial: FreeTrial | null;
  optionsList: FeatureOptions[];

  curCusProduct?: FullCusProduct | undefined;
  successUrl?: string | undefined;
  // remainingItemSets?: any[];
  itemSets?: any[];
  cusProducts?: FullCusProduct[];
};

export type InsertCusProductParams = {
  customer: Customer;
  org: Organization;

  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];

  freeTrial: FreeTrial | null;
  optionsList: FeatureOptions[];

  curCusProduct?: FullCusProduct | undefined;
  successUrl?: string | undefined;
  // remainingItemSets?: any[];
  itemSets?: any[];
};
