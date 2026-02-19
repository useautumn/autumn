import { FeatureNotFoundError, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { getCreditSystemsFromFeature } from "../../creditSystemUtils.js";
import { FeatureService } from "../../FeatureService.js";

export const handleDeleteFeatureRpc = createRoute({
	body: z.object({
		feature_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, features } = ctx;
		const { feature_id } = c.req.valid("json");

		const feature = features.find((f) => f.id === feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: feature_id });
		}

		const creditSystems = getCreditSystemsFromFeature({
			featureId: feature_id,
			features,
		});

		if (creditSystems.length > 0) {
			throw new RecaseError({
				message: `Feature ${feature_id} is used by credit system ${creditSystems[0].id}`,
			});
		}

		// Get prices that use this feature
		const ent = await EntitlementService.getByFeature({
			db,
			internalFeatureId: feature.internal_id!,
		});

		if (ent) {
			throw new RecaseError({
				message: `Feature ${feature_id} is used in a product. You must delete the product first, or archive it instead.`,
			});
		}

		await FeatureService.delete({
			db,
			orgId: org.id,
			featureId: feature_id,
			env: ctx.env,
		});

		return c.json({ success: true });
	},
});
