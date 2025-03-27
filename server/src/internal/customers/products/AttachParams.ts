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

  successUrl?: string | undefined;
  // remainingItemSets?: any[];
  itemSets?: any[];
  cusProducts?: FullCusProduct[];

  curCusProduct?: FullCusProduct | undefined;
  curScheduledProduct?: FullCusProduct | undefined | null;

  // CONFIGS
  invoiceOnly?: boolean | undefined;
  billingAnchor?: number | undefined;
  metadata?: Record<string, string> | undefined;
};

export type InsertCusProductParams = {
  customer: Customer;
  org: Organization;

  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];

  freeTrial: FreeTrial | null;
  optionsList: FeatureOptions[];

  successUrl?: string | undefined;
  // remainingItemSets?: any[];
  itemSets?: any[];

  // OTHERS
  curCusProduct?: FullCusProduct | undefined;
  cusProducts?: FullCusProduct[];

  // CONFIGS
  invoiceOnly?: boolean | undefined;
};
