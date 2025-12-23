import { decryptData } from "@server/utils/encryptUtils.js";
import type { RevenueCatProductsResponse } from "../revenuecatTypes";

export type ListRevenuecatProductsResponse = {
	products: { id: string; name: string }[];
};

export const initRevenuecatCli = ({
	projectId,
	apiKey,
}: {
	projectId: string;
	apiKey: string;
}) => {
	let resolvedApiKey = apiKey;

	resolvedApiKey = decryptData(apiKey);

	return {
		listProducts: async () => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products`,
			);
			url.searchParams.set("limit", "20");

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${resolvedApiKey}`,
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

			return {
				products: Array.from(productMap.entries()).map(([id, names]) => ({
					id,
					name: names.join(", "),
				})),
			} satisfies ListRevenuecatProductsResponse;
		},
	};
};
