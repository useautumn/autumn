import { clearOrgWithFeaturesCache } from "@autumn/cache";
import {
	AppEnv,
	agentFeatureToFeature,
	CreateFreeTrialSchema,
	CreateProductItemParamsSchema,
	CreateProductSchema,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PricingAgentFeatureInputSchema } from "../pricingAgentSchemas.js";
import { getSessionPreviewOrg } from "./previewOrgUtils.js";

const SyncPreviewPricingSchema = z.object({
	features: z.array(PricingAgentFeatureInputSchema).optional().default([]),
	products: z.array(
		CreateProductSchema.extend({
			items: z.array(CreateProductItemParamsSchema).optional().default([]),
			free_trial: CreateFreeTrialSchema.nullish().optional().default(null),
		}),
	),
});

export const handleSyncPreviewPricing = createRoute({
	scopes: {
		ALL: [Scopes.Plans.Write, Scopes.Features.Write, Scopes.Customers.Write],
	},
	body: SyncPreviewPricingSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;
		const body = c.req.valid("json");

		const previewOrg = await getSessionPreviewOrg({ ctx });

		ctx.logger.debug(
			`[Preview Sync] Starting sync for preview org: ${previewOrg.id}, features: ${body.features.length}, products: ${body.products.length}`,
		);

		ctx.logger.debug("[Preview Sync] Step 1: Nuking existing configuration...");

		const deleted = await CusService.deleteByOrgId({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});
		await queueBalanceWorkerEvicts({
			customers: deleted.map(({ id }) => ({
				orgId: previewOrg.id,
				env: AppEnv.Sandbox,
				customerId: id,
			})),
		});

		await ProductService.deleteByOrgId({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		await FeatureService.deleteByOrgId({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		await clearOrgWithFeaturesCache({
			ctx: getMiscCacheContext(),
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		ctx.logger.debug("[Preview Sync] Step 2: Pushing new configuration...");

		const previewCtx = {
			...ctx,
			org: previewOrg,
			env: AppEnv.Sandbox,
			features: [] as Awaited<ReturnType<typeof FeatureService.list>>,
		};

		const seenFeatureIds = new Set<string>();
		const uniqueFeatures = body.features.filter((f) => {
			if (seenFeatureIds.has(f.id)) {
				ctx.logger.warn(
					`[Preview Sync] Duplicate feature ID found: ${f.id}, skipping...`,
				);
				return false;
			}
			seenFeatureIds.add(f.id);
			return true;
		});

		for (const apiFeature of uniqueFeatures) {
			const dbFeature = agentFeatureToFeature(apiFeature);
			await createFeature({
				ctx: previewCtx,
				data: {
					id: dbFeature.id,
					name: dbFeature.name,
					type: dbFeature.type,
					config: dbFeature.config,
					event_names: dbFeature.event_names,
					model_markups: dbFeature.model_markups,
				},
				skipGenerateDisplay: true,
			});
		}

		const updatedFeatures = await FeatureService.list({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		await Promise.all(
			body.products.map((apiProduct) =>
				createProduct({
					ctx: {
						...previewCtx,
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
				}),
			),
		);

		await invalidateProductsCache({
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		ctx.logger.debug(
			`[Preview Sync] Summary: ${body.features.length} features, ${body.products.length} products`,
		);

		return c.json({
			success: true,
			org_id: previewOrg.id,
			features_count: body.features.length,
			products_count: body.products.length,
		});
	},
});
