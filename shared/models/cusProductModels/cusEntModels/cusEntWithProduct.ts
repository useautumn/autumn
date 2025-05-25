import { CusProductSchema } from "../cusProductModels.js";
import { FullCustomerEntitlementSchema } from "./cusEntModels.js";
import { z } from "zod";

export const FullCusEntWithProductSchema = FullCustomerEntitlementSchema.extend(
  {
    customer_product: CusProductSchema,
  },
);
export type FullCusEntWithProduct = z.infer<typeof FullCusEntWithProductSchema>;
