import { AppEnv } from "@shared/index";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import type { RevenueCatProductsResponse } from "../revcatTypes";

export type Resp = {
	products: { id: string; name: string }[];
};

export const handleGetRevenueCatProducts = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const revenueCatConfig = org.processor_configs?.revenuecat;

		if (!revenueCatConfig) {
			return c.json({ products: [] }, 404);
		}

		const projectId =
			env === AppEnv.Live
				? revenueCatConfig.project_id
				: revenueCatConfig.sandbox_project_id;
		const apiKey =
			env === AppEnv.Live
				? revenueCatConfig.api_key
				: revenueCatConfig.sandbox_api_key;

		const url = new URL(
			`https://api.revenuecat.com/v2/projects/${projectId}/products`,
		);
		url.searchParams.set("limit", "20");

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		});

		const data = (await response.json()) as RevenueCatProductsResponse;

		// Group products by store_identifier and combine names
		const productMap = new Map<string, string[]>();
		for (const product of data.items) {
			const existing = productMap.get(product.store_identifier);
			if (existing) {
				existing.push(product.display_name);
			} else {
				productMap.set(product.store_identifier, [product.display_name]);
			}
		}

		return c.json({
			products: Array.from(productMap.entries()).map(([id, names]) => ({
				id,
				name: names.join(", "),
			})),
		} satisfies Resp);
	},
});
