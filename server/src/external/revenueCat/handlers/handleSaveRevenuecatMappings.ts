import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { RCMappingService } from "../misc/RCMappingService";

const FeatureQuantitySchema = z.object({
	feature_id: z.string(),
	quantity: z.number().nonnegative().optional(),
});

const MappingSchema = z.object({
	autumn_product_id: z.string(),
	revenuecat_product_ids: z.array(z.string()),
	feature_quantities: z
		.record(z.string(), z.array(FeatureQuantitySchema))
		.optional(),
});

export const handleSaveRCMappings = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({
		mappings: z.array(MappingSchema),
	}),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { mappings } = c.req.valid("json");

		for (const mapping of mappings) {
			if (mapping.revenuecat_product_ids.length > 0) {
				await RCMappingService.upsert({
					db,
					data: {
						org_id: org.id,
						env,
						autumn_product_id: mapping.autumn_product_id,
						revenuecat_product_ids: mapping.revenuecat_product_ids,
						feature_quantities: mapping.feature_quantities ?? null,
					},
				});
			} else {
				await RCMappingService.delete({
					db,
					orgId: org.id,
					env,
					autumnProductId: mapping.autumn_product_id,
				});
			}
		}

		const updatedMappings = await RCMappingService.getAll({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ mappings: updatedMappings });
	},
});
