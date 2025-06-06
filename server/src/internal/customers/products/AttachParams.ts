import {
  Customer,
  EntitlementWithFeature,
  Entity,
  FeatureOptions,
  Feature,
  FreeTrial,
  FullCusProduct,
  FullProduct,
  Organization,
  Price,
  AttachScenario,
} from "@autumn/shared";

import { z } from "zod";

export type AttachParams = {
  org: Organization;
  customer: Customer;
  products: FullProduct[];

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

  entities: Entity[];

  isCustom?: boolean;
  disableFreeTrial?: boolean;
  features: Feature[];

  entityId?: string;
  internalEntityId?: string;

  checkoutSessionParams?: any;
  apiVersion?: number;
  scenario?: AttachScenario;

  fromMigration?: boolean;
  req?: any;
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
  entities: Entity[];
  isCustom?: boolean;
  disableFreeTrial?: boolean;
  features: Feature[];

  entityId?: string;
  internalEntityId?: string;
  fromMigration?: boolean;
  req?: any;
};

export const AttachResultSchema = z.object({
  customer_id: z.string(),
  product_ids: z.array(z.string()),
  code: z.string(),
  message: z.string(),

  checkout_url: z.string().nullish(),
  invoice: z.any().nullish(),
});

export type AttachResult = z.infer<typeof AttachResultSchema>;
