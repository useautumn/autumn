import {
	AppEnv,
	apiFeatureToDbFeature,
	CreateFeatureV0ParamsSchema,
	CreateFreeTrialSchema,
	CreateProductItemParamsSchema,
	CreateProductSchema,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createProduct } from "@/internal/products/handlers/productActions/createProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { buildPreviewOrgSlug } from "./handleSetupPreviewOrg.js";

const SyncPreviewPricingSchema = z.object({
	features: z.array(CreateFeatureV0ParamsSchema).optional().default([]),
	products: z.array(
		CreateProductSchema.extend({
			items: z.array(CreateProductItemParamsSchema).optional().default([]),
			free_trial: CreateFreeTrialSchema.nullish().optional().default(null),
		}),
	),
});

/**
 * Syncs pricing configuration to the preview sandbox organization.
 * Uses session auth (betterAuthMiddleware) to identify the user's preview org.
 * - Nukes existing config (customers, products, features)
 * - Pushes new config from the request body
 */
export const handleSyncPreviewPricing = createRoute({
	body: SyncPreviewPricingSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, userId } = ctx;
		const body = c.req.valid("json");

		if (!userId) {
			throw new RecaseError({
				message: "User not authenticated",
				code: "unauthenticated",
				statusCode: 401,
			});
		}

		// Find the preview org using session auth
		const previewSlug = buildPreviewOrgSlug({
			userId,
			masterOrgId: masterOrg.id,
		});

		const previewOrg = await OrgService.getBySlug({ db, slug: previewSlug });
		if (!previewOrg) {
			throw new RecaseError({
				message: "Preview org not found. Call /preview/setup first.",
				code: "preview_org_not_found",
				statusCode: 404,
			});
		}

		ctx.logger.debug(
			`[Preview Sync] Starting sync for preview org: ${previewOrg.id}, features: ${body.features.length}, products: ${body.products.length}`,
		);

		// Step 1: Nuke existing config
		ctx.logger.debug("[Preview Sync] Step 1: Nuking existing configuration...");

		await CusService.deleteByOrgId({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
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

		// Step 2: Push new config
		ctx.logger.debug("[Preview Sync] Step 2: Pushing new configuration...");

		// Build a context for the preview org
		const previewCtx = {
			...ctx,
			org: previewOrg,
			env: AppEnv.Sandbox,
			features: [] as Awaited<ReturnType<typeof FeatureService.list>>,
		};

		// Deduplicate features by ID (keep first occurrence)
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

		// Create features sequentially to avoid race conditions
		for (const apiFeature of uniqueFeatures) {
			const dbFeature = apiFeatureToDbFeature({ apiFeature });
			await createFeature({
				ctx: previewCtx,
				data: {
					id: dbFeature.id,
					name: dbFeature.name,
					type: dbFeature.type,
					config: dbFeature.config,
					event_names: dbFeature.event_names,
				},
				skipGenerateDisplay: true,
			});
		}

		// Get updated features for product creation
		const updatedFeatures = await FeatureService.list({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
		});

		// Create products
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
