import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { RCMappingService } from "../misc/RCMappingService";

const MappingSchema = z.object({
	autumn_product_id: z.string(),
	revenuecat_product_ids: z.array(z.string()),
});

export const handleSaveRCMappings = createRoute({
	body: z.object({
		mappings: z.array(MappingSchema),
	}),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { mappings } = c.req.valid("json");

		// Process each mapping
		for (const mapping of mappings) {
			if (mapping.revenuecat_product_ids.length > 0) {
				// Upsert mapping if it has products
				await RCMappingService.upsert({
					db,
					data: {
						org_id: org.id,
						env,
						autumn_product_id: mapping.autumn_product_id,
						revenuecat_product_ids: mapping.revenuecat_product_ids,
					},
				});
			} else {
				// Delete mapping if no products assigned
				await RCMappingService.delete({
					db,
					orgId: org.id,
					env,
					autumnProductId: mapping.autumn_product_id,
				});
			}
		}

		// Return updated mappings
		const updatedMappings = await RCMappingService.getAll({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ mappings: updatedMappings });
	},
});
