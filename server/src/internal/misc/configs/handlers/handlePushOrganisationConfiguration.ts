import {
	apiFeatureToDbFeature,
	CreateFeatureV0ParamsSchema,
	CreateFreeTrialSchema,
	CreateProductItemParamsSchema,
	CreateProductSchema,
} from "@shared/index";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { FeatureService } from "@/internal/features/FeatureService";
import { createFeature } from "@/internal/features/featureActions/createFeature";
import { createProduct } from "@/internal/product/actions/createProduct";
import { ProductService } from "@/internal/products/ProductService";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils";

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

		let productsCreated = false;

		await db.transaction(async (tx) => {
			const txDb = tx as unknown as DrizzleCli;
			const txCtx = { ...ctx, db: txDb };

			for (const apiFeature of body.features) {
				if (features.some((x) => x.id === apiFeature.id)) {
					continue;
				}

				const dbFeature = apiFeatureToDbFeature({
					apiFeature,
				});

				await createFeature({
					ctx: txCtx,
					data: {
						id: dbFeature.id,
						name: dbFeature.name,
						type: dbFeature.type,
						config: dbFeature.config,
						event_names: dbFeature.event_names,
					},
				});
			}

			const updatedFeatures = await FeatureService.list({
				db: txDb,
				orgId: org.id,
				env,
			});

			for (const apiProduct of body.products) {
				if (products.some((x) => x.id === apiProduct.id)) {
					continue;
				}

				await createProduct({
					ctx: {
						...txCtx,
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
				productsCreated = true;
			}
		});

		if (productsCreated) {
			await invalidateProductsCache({ orgId: org.id, env });
		}

		return c.json({
			features: body.features,
			products: body.products,
		});
	},
});
