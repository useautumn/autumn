import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels";
import { z } from "zod/v4";

export const CustomizePlanV0Schema = z.array(ProductItemSchema);

export type CustomizePlanV0 = z.infer<typeof CustomizePlanV0Schema>;
