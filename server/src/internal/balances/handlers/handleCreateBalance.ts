import {
    AllowanceType,
    type CustomerEntitlement,
    CustomerNotFoundError,
    EntInterval,
    FeatureSchema,
    FeatureType
} from "@shared/index";
import { initEntitlement } from "@tests/utils/init";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { initCusEntitlement } from "@/internal/customers/add-product/initCusEnt";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { initNextResetAt } from "@/internal/customers/cusProducts/insertCusProduct/initCusEnt/initNextResetAt";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";

const CreateBalanceSchema = z.object({
    feature_id: z.string(),
    granted_balance: z.string().optional(),
    unlimited: z.boolean().optional(),
    reset: z
        .object({
            interval: z.enum(EntInterval),
            interval_count: z.number().optional(),
        })
        .optional(),
    customer_id: z.string(),
});

const CreateBalanceForValidation = CreateBalanceSchema.extend({
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
        if (!data.granted_balance) {
            return false;
        }
    }

    return true;
});

export const handleCreateBalance = createRoute({
    body: CreateBalanceSchema,
    handler: async (c) => {
        const ctx = c.get("ctx");
        const { feature_id, customer_id, granted_balance, unlimited, reset } =
            c.req.valid("json");

        const feature = ctx.features.find((f) => f.id === feature_id);

        const validatedData = CreateBalanceForValidation.parse({
            feature: feature,
            granted_balance,
            unlimited,
            reset,
            customer_id,
        });

        const fullCus = await CusService.getFull({
            db: ctx.db,
            idOrInternalId: customer_id,
            orgId: ctx.org.id,
            env: ctx.env,
        });

        if (!fullCus) {
            throw new CustomerNotFoundError({ customerId: customer_id });
        }

        // const entitlements = fullCus.customer_products.flatMap(
        //     (cp) => cp.customer_entitlements,
        // );

        // const entitlement = entitlements.find((e) => e.feature_id === feature_id);
        // if (entitlement) {
        //     throw new RecaseError({
        //         message: `Entitlement ${feature_id} already exists for customer ${customer_id}`,
        //         code: "error_code_already_exists",
        //         statusCode: StatusCodes.BAD_REQUEST,
        //     });
        // }

        const ent = initEntitlement({
            feature: feature,
            allowance: granted_balance ? parseFloat(granted_balance) : undefined,
            interval: reset?.interval ? (reset.interval as EntInterval) : undefined,
            allowanceType: unlimited ? AllowanceType.Unlimited : AllowanceType.Fixed,
        });

        await EntitlementService.insert({
            db: ctx.db,
            data: [ent],
        });

        const entitlementWithFeature = {
            ...ent,
            feature,
            feature_id: feature.id,
        };

        const cusEnt = initCusEntitlement({
            entitlement: entitlementWithFeature,
            customer: fullCus,
            cusProductId: null,
            freeTrial: null,
            nextResetAt:
                initNextResetAt({
                    entitlement: entitlementWithFeature,
                    nextResetAt: undefined,
                    trialEndsAt: undefined,
                    freeTrial: null,
                    anchorToUnix: undefined,
                    now: Date.now(),
                }) ?? Date.now(),
            entities: [],
            carryExistingUsages: false,
            replaceables: [],
            now: Date.now(),
            productOptions: undefined,
        }) satisfies CustomerEntitlement;

        await CusEntService.insert({
            db: ctx.db,
            data: [cusEnt as CustomerEntitlement],
        });

        return c.json({ success: true });
    },
});
