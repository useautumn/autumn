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
  included_usage: z
    .number()
    .or(z.string())
    .transform((val) => {
      if (val === "Unlimited") {
        return Infinite;
      }
      let num = Number(val);

      if (isNaN(num) || num <= 0) {
        num = 0;
      }

      return num;
    }),
});

export type FeatureItem = z.infer<typeof FeatureItemSchema>;
