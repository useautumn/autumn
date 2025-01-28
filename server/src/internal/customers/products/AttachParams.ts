import {
  Customer,
  EntitlementWithFeature,
  FeatureOptions,
  FreeTrial,
  FullProduct,
  Organization,
  Price,
} from "@autumn/shared";

export type AttachParams = {
  customer: Customer;
  product: FullProduct;
  org: Organization;

  prices: Price[];
  entitlements: EntitlementWithFeature[];
  freeTrial: FreeTrial | null;
  optionsList: FeatureOptions[];
};
