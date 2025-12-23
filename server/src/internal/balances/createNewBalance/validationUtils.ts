import { FeatureSchema, FeatureType, ResetInterval } from "@shared/index";

import z from "zod/v4";

export const CreateBalanceSchema = z.object({
    feature_id: z.string(),
    granted_balance: z.string().optional(),
    unlimited: z.boolean().optional(),
    reset: z
        .object({
            interval: z.enum(ResetInterval),
            interval_count: z.number().optional(),
        })
        .optional(),
    customer_id: z.string(),
});

export const CreateBalanceForValidation = CreateBalanceSchema.extend({
    feature: FeatureSchema,
}).refine((data) => {
    if (!data.feature) {
        return false;
    }

    if (data.feature.type === FeatureType.Boolean) {
        if (data.granted_balance || data.unlimited || data.reset?.interval) {
            return false;
        }
    }

    if (data.feature.type === FeatureType.Metered) {
        if (!data.granted_balance && !data.unlimited) {
            return false;
        }
        if (data.granted_balance && data.unlimited) {
            return false;
        }
        if (data.unlimited && data.reset?.interval) {
            return false;
        }
    }

    return true;
});
