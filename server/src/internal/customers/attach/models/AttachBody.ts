import { notNullish } from "@/utils/genUtils.js";
import {
  CreateFreeTrialSchema,
  FreeTrialSchema,
  ProductItemSchema,
} from "@autumn/shared";

import { FeatureOptionsSchema } from "@autumn/shared";
import { z } from "zod";

export const AttachBodySchema = z
  .object({
    // Customer Info
    customer_id: z
      .string()
      .describe("ID of the customer to attach the product to"),

    customer_data: z
      .any()
      .optional()
      .describe("Customer data if using attach to auto create customer"),

    // Entity Info
    entity_id: z.string().optional(),
    entity_data: z.any().optional(),

    // Product Info
    product_id: z.string().optional(),
    product_ids: z.array(z.string()).min(1).optional(),

    // Options
    options: z.array(FeatureOptionsSchema).optional(),

    // Custom Product
    is_custom: z.boolean().optional(),
    items: z.array(ProductItemSchema).optional(),
    free_trial: CreateFreeTrialSchema.or(z.boolean()).optional(),

    // New Version
    version: z.number().optional(),

    // Others
    success_url: z.string().optional(),
    force_checkout: z.boolean().optional(),
    invoice_only: z.boolean().optional(),
    metadata: z.any().optional(),
    billing_cycle_anchor: z.number().optional(),
    checkout_session_params: z.any().optional(),
  })
  .refine((data) => !(data.product_id && data.product_ids), {
    message: "Either product_id or product_ids should be provided, not both",
  })
  .refine(
    (data) => {
      if (
        notNullish(data.product_ids) &&
        new Set(data.product_ids).size !== data.product_ids!.length
      ) {
        return false;
      }

      return true;
    },
    {
      message: "Can't pass in duplicate product_ids",
    },
  )
  .refine(
    (data) => {
      if (data.product_ids && data.is_custom) {
        return false;
      }

      return true;
    },
    {
      message: "Can't pass in product_ids if is_custom is true",
    },
  )
  .refine(
    (data) => {
      if (data.items && !data.is_custom) {
        return false;
      }

      return true;
    },
    {
      message: "Can't pass in items if is_custom is false",
    },
  )
  .refine(
    (data) => {
      if (data.free_trial && !data.is_custom) {
        return false;
      }

      return true;
    },
    {
      message: "Can't pass in free_trial if is_custom is false",
    },
  );

export type AttachBody = z.infer<typeof AttachBodySchema>;
