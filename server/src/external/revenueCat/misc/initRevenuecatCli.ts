import { decryptData } from "@server/utils/encryptUtils.js";
import type {
	RevenueCatApp,
	RevenueCatAppsResponse,
	RevenueCatCreateInStoreBody,
	RevenueCatCreateProductBody,
	RevenueCatCreateProjectBody,
	RevenueCatCreateWebhookBody,
	RevenueCatPrice,
	RevenueCatProduct,
	RevenueCatProject,
	RevenueCatProjectsResponse,
	RevenueCatPublicApiKey,
	RevenueCatPublicApiKeysResponse,
	RevenueCatPurchase,
	RevenueCatSubscription,
	RevenueCatUpdateProductBody,
	RevenueCatWebhookIntegration,
} from "../revenuecatTypes";
import { revenuecatAuthError } from "./revenuecatAuthError.js";
import { callRcMcpTool } from "./revenuecatMcp.js";

type ListRevenuecatProductsResponse = {
	products: { id: string; name: string; platforms: string[] }[];
};

type ListRevenuecatProjectsResponse = {
	projects: { id: string; name: string }[];
};

export const initRevenuecatCli = ({
	projectId,
	apiKey,
	accessToken,
	// Injected so unit tests can supply a fake transport instead of touching global fetch.
	fetchImpl = fetch,
}: {
	projectId?: string;
	apiKey?: string;
	accessToken?: string;
	fetchImpl?: typeof fetch;
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

	const checkOk = async (response: Response) => {
		if (!response.ok) {
			let message: string;
			try {
				const body = await response.json();
				message = JSON.stringify(body);
			} catch {
				message = response.statusText;
			}
			if (response.status === 401 || response.status === 403) {
				throw revenuecatAuthError({ detail: message });
			}
			const error = new Error(
				`RevenueCat error (${response.status}): ${message}`,
			) as Error & { status: number };
			error.status = response.status;
			throw error;
		}
	};

	async function* listPages<T>(firstPage: string) {
		let nextPage: string | null | undefined = firstPage;
		while (nextPage) {
			const response = await fetchImpl(
				new URL(nextPage, "https://api.revenuecat.com"),
				{ headers: authHeaders },
			);
			await checkOk(response);
			const data = (await response.json()) as {
				items: T[];
				next_page?: string | null;
			};
			yield data.items;
			nextPage = data.next_page;
		}
	}

	const listAll = async <T>(firstPage: string): Promise<T[]> => {
		const items: T[] = [];
		for await (const page of listPages<T>(firstPage)) items.push(...page);
		return items;
	};

	return {
		createProject: async ({ name }: RevenueCatCreateProjectBody) => {
			const url = new URL("https://api.revenuecat.com/v2/projects");
			const response = await fetchImpl(url, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify({ name }),
			});
			await checkOk(response);
			return (await response.json()) as RevenueCatProject;
		},

		listAppPublicApiKeys: async (
			appId: string,
		): Promise<RevenueCatPublicApiKey[]> => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/apps/${appId}/public_api_keys`,
			);
			const response = await fetchImpl(url, { headers: authHeaders });
			await checkOk(response);
			const data = (await response.json()) as
				| RevenueCatPublicApiKeysResponse
				| RevenueCatPublicApiKey[];
			return Array.isArray(data) ? data : (data.items ?? []);
		},

		listApps: async (): Promise<RevenueCatApp[]> => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/apps`,
			);
			url.searchParams.set("limit", "50");

			const response = await fetchImpl(url, { headers: authHeaders });
			await checkOk(response);

			const data = (await response.json()) as RevenueCatAppsResponse;
			return data.items ?? [];
		},

		createProduct: async (body: RevenueCatCreateProductBody) => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products`,
			);
			const response = await fetchImpl(url, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(body),
			});
			await checkOk(response);
			return (await response.json()) as RevenueCatProduct;
		},

		findProductByStoreIdentifier: async ({
			appId,
			storeIdentifier,
		}: {
			appId: string;
			storeIdentifier: string;
		}): Promise<RevenueCatProduct | null> => {
			for await (const page of listPages<RevenueCatProduct>(
				`/v2/projects/${projectId}/products?limit=100`,
			)) {
				const match = page.find(
					(p) => p.app_id === appId && p.store_identifier === storeIdentifier,
				);
				if (match) return match;
			}

			return null;
		},

		listAllProducts: async (): Promise<RevenueCatProduct[]> => {
			return listAll<RevenueCatProduct>(
				`/v2/projects/${projectId}/products?limit=100`,
			);
		},

		listCustomerSubscriptions: async (
			customerId: string,
		): Promise<RevenueCatSubscription[]> => {
			return listAll<RevenueCatSubscription>(
				`/v2/projects/${projectId}/customers/${customerId}/subscriptions?limit=100`,
			);
		},

		listCustomerPurchases: async (
			customerId: string,
		): Promise<RevenueCatPurchase[]> => {
			return listAll<RevenueCatPurchase>(
				`/v2/projects/${projectId}/customers/${customerId}/purchases?limit=100`,
			);
		},

		listProductPrices: async (
			revenuecatProductId: string,
		): Promise<RevenueCatPrice[]> => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products/${revenuecatProductId}/prices`,
			);
			const response = await fetchImpl(url, { headers: authHeaders });
			await checkOk(response);
			// RC returns a bare array here, not the usual { items } envelope.
			const data = (await response.json()) as
				| RevenueCatPrice[]
				| { items?: RevenueCatPrice[] };
			return Array.isArray(data) ? data : (data.items ?? []);
		},

		// Test-store prices can't be set over the REST API — only via RC's MCP server.
		setTestStoreProductPrice: async (
			revenuecatProductId: string,
			{ amountMicros, currency }: { amountMicros: number; currency: string },
		) =>
			callRcMcpTool({
				accessToken: resolvedAccessToken,
				name: "create-product-prices",
				// RC's tool requires `prices` nested under `body`; top-level fields are
				// rejected (additionalProperties:false) and surface as a generic 500.
				arguments: {
					project_id: projectId,
					product_id: revenuecatProductId,
					body: { prices: [{ amount_micros: amountMicros, currency }] },
				},
				fetchImpl,
			}),

		listProductStoreIdentifiers: async (): Promise<Set<string>> => {
			const ids = new Set<string>();
			for await (const page of listPages<RevenueCatProduct>(
				`/v2/projects/${projectId}/products?limit=100`,
			)) {
				for (const product of page) ids.add(product.store_identifier);
			}

			return ids;
		},

		updateProduct: async (
			revenuecatProductId: string,
			body: RevenueCatUpdateProductBody,
		) => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products/${revenuecatProductId}`,
			);
			const response = await fetchImpl(url, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(body),
			});
			await checkOk(response);
			return (await response.json()) as RevenueCatProduct;
		},

		createInStore: async (
			revenuecatProductId: string,
			body?: RevenueCatCreateInStoreBody,
		) => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/products/${revenuecatProductId}/create_in_store`,
			);
			const response = await fetchImpl(url, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(body ?? {}),
			});
			await checkOk(response);
			return await response.json();
		},

		listProducts: async () => {
			const items = await listAll<RevenueCatProduct>(
				`/v2/projects/${projectId}/products?limit=100`,
			);

			// Resolve each app's store type so products can be labelled by platform.
			const appsUrl = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/apps`,
			);
			appsUrl.searchParams.set("limit", "50");
			const appsResponse = await fetchImpl(appsUrl, { headers: authHeaders });
			await checkOk(appsResponse);
			const appsData = (await appsResponse.json()) as RevenueCatAppsResponse;
			const appTypeById = new Map(
				(appsData.items ?? []).map((app) => [app.id, app.type]),
			);

			// Group products by store_identifier, combining names and platforms.
			const productMap = new Map<
				string,
				{ names: string[]; platforms: Set<string> }
			>();
			for (const product of items) {
				const entry = productMap.get(product.store_identifier) ?? {
					names: [],
					platforms: new Set<string>(),
				};
				entry.names.push(product.display_name);
				const platform = appTypeById.get(product.app_id);
				if (platform) {
					entry.platforms.add(platform);
				}
				productMap.set(product.store_identifier, entry);
			}

			return {
				products: Array.from(productMap.entries()).map(
					([id, { names, platforms }]) => ({
						id,
						name: names.join(", "),
						platforms: Array.from(platforms),
					}),
				),
			} satisfies ListRevenuecatProductsResponse;
		},

		listWebhookIntegrations: async (): Promise<
			RevenueCatWebhookIntegration[]
		> => {
			return listAll<RevenueCatWebhookIntegration>(
				`/v2/projects/${projectId}/integrations/webhooks?limit=100`,
			);
		},

		createWebhookIntegration: async (
			body: RevenueCatCreateWebhookBody,
		): Promise<RevenueCatWebhookIntegration> => {
			const url = new URL(
				`https://api.revenuecat.com/v2/projects/${projectId}/integrations/webhooks`,
			);
			const response = await fetchImpl(url, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(body),
			});
			await checkOk(response);
			return (await response.json()) as RevenueCatWebhookIntegration;
		},

		listProjects: async () => {
			const url = new URL("https://api.revenuecat.com/v2/projects");
			url.searchParams.set("limit", "100");

			const response = await fetchImpl(url, { headers: authHeaders });
			await checkOk(response);

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
