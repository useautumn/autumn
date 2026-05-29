import { decryptData } from "@server/utils/encryptUtils.js";
import type {
	RevenueCatProductsResponse,
	RevenueCatProjectsResponse,
} from "../revenuecatTypes";

type ListRevenuecatProductsResponse = {
	products: { id: string; name: string }[];
};

type ListRevenuecatProjectsResponse = {
	projects: { id: string; name: string }[];
};

export const initRevenuecatCli = ({
	projectId,
	apiKey,
	accessToken,
}: {
	projectId?: string;
	apiKey?: string;
	accessToken?: string;
}) => {
	const resolvedAccessToken =
		accessToken ?? (apiKey ? decryptData(apiKey) : undefined);

	if (!resolvedAccessToken) {
		throw new Error("RevenueCat access token or API key is required");
	}

	const authHeaders = {
		Authorization: `Bearer ${resolvedAccessToken}`,
		"Content-Type": "application/json",
	};

	return {
		listProducts: async () => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products`,
			);
			url.searchParams.set("limit", "20");

			const response = await fetch(url, { headers: authHeaders });

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

		listProjects: async () => {
			const url = new URL("https://api.revenuecat.com/v2/projects");
			url.searchParams.set("limit", "100");

			const response = await fetch(url, { headers: authHeaders });

			const data = (await response.json()) as RevenueCatProjectsResponse;

			return {
				projects: (data.items ?? []).map((project) => ({
					id: project.id,
					name: project.name,
				})),
			} satisfies ListRevenuecatProjectsResponse;
		},
	};
};
