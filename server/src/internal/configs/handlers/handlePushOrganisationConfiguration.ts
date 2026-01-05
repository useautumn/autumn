import {
    apiFeatureToDbFeature,
    CreateFeatureV0ParamsSchema,
    CreateFreeTrialSchema,
    CreateProductItemParamsSchema,
    CreateProductSchema
} from "@shared/index";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { FeatureService } from "@/internal/features/FeatureService";
import { createFeature } from "@/internal/features/featureActions/createFeature";
import { createProduct } from "@/internal/products/handlers/productActions/createProduct";
import { ProductService } from "@/internal/products/ProductService";

const OrganisationConfigurationSchema = z.object({
    features: z.array(CreateFeatureV0ParamsSchema).optional().default([]),
    products: z.array(
        CreateProductSchema.extend({
            items: z.array(CreateProductItemParamsSchema).optional().default([]),
            free_trial: CreateFreeTrialSchema.nullish().optional().default(null),
        }),
    ),
});

export const handlePushOrganisationConfiguration = createRoute({
    body: OrganisationConfigurationSchema,
    handler: async (c) => {
        const body = c.req.valid("json");
        const ctx = c.get("ctx");
        const { features, db, org, env } = ctx;
        const products = await ProductService.listFull({
            db,
            orgId: org.id,
            env,
        });

        // Handle loading the features first (products depend on features)
        for (const apiFeature of body.features) {
            if (features.some((x) => x.id === apiFeature.id)) {
                continue;
            }

            // Convert API feature format to DB feature format
            const dbFeature = apiFeatureToDbFeature({
                apiFeature,
                originalFeature: undefined,
            });

            await createFeature({
                ctx,
                data: {
                    id: dbFeature.id,
                    name: dbFeature.name,
                    type: dbFeature.type,
                    config: dbFeature.config,
                    event_names: dbFeature.event_names,
                },
            });
        }

        // Refresh features after creating new ones (products depend on features)
        const updatedFeatures = await FeatureService.list({
            db,
            orgId: org.id,
            env,
        });

        // Handle loading the products
        for (const apiProduct of body.products) {
            if (products.some((x) => x.id === apiProduct.id)) {
                continue;
            }

            await createProduct({
                ctx: {
                    ...ctx,
                    features: updatedFeatures,
                },
                data: {
                    id: apiProduct.id,
                    name: apiProduct.name,
                    is_add_on: apiProduct.is_add_on,
                    is_default: apiProduct.is_default,
                    group: apiProduct.group,
                    items: apiProduct.items,
                    free_trial: apiProduct.free_trial,
                },
            });
        }

        return c.json({
            features: body.features,
            products: body.products,
        });
    },
});
