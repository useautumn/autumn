import { AppEnv } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type CatalogItem = { id: string; name: string };
export type CatalogProduct = CatalogItem & { featureIds: string[] };

type RawProduct = {
	id: string;
	name: string;
	items?: { feature_id?: string | null }[];
};

// Lists a SPECIFIC sandbox's plans + features by overriding x-sandbox-org-id
// per request (skipSandbox keeps the interceptor from forcing the active one),
// so the copy dialog can show the source sandbox's catalog while you sit in a
// different one.
export const useSandboxCatalogQuery = (sandboxId: string | null) => {
	const axiosInstance = useAxiosInstance({
		skipSandbox: true,
		env: AppEnv.Sandbox,
	});

	const { data, isLoading } = useQuery({
		queryKey: ["sandbox-catalog", sandboxId],
		enabled: !!sandboxId,
		queryFn: async () => {
			const headers = { "x-sandbox-org-id": sandboxId as string };
			const [productsRes, featuresRes] = await Promise.all([
				axiosInstance.get("/v1/products", { headers }),
				axiosInstance.post("/v1/features.list", {}, { headers }),
			]);
			const rawProducts = (productsRes.data?.list ?? []) as RawProduct[];
			return {
				products: rawProducts.map((p) => ({
					id: p.id,
					name: p.name,
					featureIds: (p.items ?? [])
						.map((i) => i.feature_id)
						.filter((id): id is string => Boolean(id)),
				})) as CatalogProduct[],
				features: (featuresRes.data?.list ?? []) as CatalogItem[],
			};
		},
	});

	return {
		products: data?.products ?? [],
		features: data?.features ?? [],
		isLoading,
	};
};
