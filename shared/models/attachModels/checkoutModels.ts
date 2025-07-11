import { z } from "zod";
import { AttachScenario } from "../checkModels/checkPreviewModels.js";
import { ProductItemResponseSchema } from "../productV2Models/productItemModels/prodItemResponseModels.js";
import { ProductResponseSchema } from "../productV2Models/productResponseModels.js";

export const CheckoutResponseSchema = z.object({
  url: z.string().nullish(),
  customer_id: z.string(),
  scenario: z.nativeEnum(AttachScenario),
  lines: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
      item: ProductItemResponseSchema.nullish(),
    }),
  ),
  product: ProductResponseSchema.nullish(),
});
