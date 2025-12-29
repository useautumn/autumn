import {
    ErrCode,
    type Feature,
    FeatureSchema,
    FeatureType,
    RecaseError,
    ResetInterval,
} from "@shared/index";
import { StatusCodes } from "http-status-codes";
import z from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

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

export const validateBooleanEntitlementConflict = async ({
    ctx,
    feature,
    internalCustomerId,
}: {
    ctx: AutumnContext;
    feature: Feature;
    internalCustomerId: string;
}) => {
    if (feature.type === FeatureType.Boolean) {
        const existingBooleanEntitlement = await CusEntService.getByFeature({
            db: ctx.db,
            internalFeatureId: feature.internal_id!,
            internalCustomerId,
        });

        if (existingBooleanEntitlement.length > 0) {
            throw new RecaseError({
                message: `A boolean entitlement ${feature.id} already exists for customer ${internalCustomerId}`,
                code: ErrCode.InvalidRequest,
                statusCode: StatusCodes.BAD_REQUEST,
            });
        }
    }
};
