import {
  ProductItemFeatureType,
  ProductItemSchema,
  ProductItemInterval,
  Infinite,
} from "@autumn/shared";
import { z } from "zod";

export const FeatureItemSchema = ProductItemSchema.pick({
  feature_id: true,
  feature_type: true,
  included_usage: true,
  interval: true,
  entity_feature_id: true,
  reset_usage_when_enabled: true,
}).extend({
  feature_id: z.string().nonempty(),
});

export type FeatureItem = z.infer<typeof FeatureItemSchema>;
