import { ProductItemSchema } from "./productItemModels.js";
import { Infinite } from "../../productModels/productEnums.js";
import { z } from "zod";

export const FeatureItemSchema = ProductItemSchema.pick({
  feature_id: true,
  feature_type: true,
  included_usage: true,
  interval: true,
  entity_feature_id: true,
  reset_usage_when_enabled: true,
  config: true,
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
    })
    .nullish(),
});

export type FeatureItem = z.infer<typeof FeatureItemSchema>;
