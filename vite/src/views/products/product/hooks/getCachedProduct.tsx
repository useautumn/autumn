import type { ProductV2 } from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useProductQueryState } from "./useProductQuery";

export const useCachedProduct = ({
	productId,
}: {
	productId: string | undefined;
}) => {
	const queryClient = useQueryClient();
	const { queryStates } = useProductQueryState();
	const version = queryStates.version;

	const getCachedProduct = (): ProductV2 | null => {
		if (!productId) return null;

		const queryCache = queryClient.getQueryCache();
		const productsQueries = queryCache.findAll({
			queryKey: ["products"],
		});

		const sortedQueries = productsQueries.sort((a, b) => {
			const aTime = a.state.dataUpdatedAt || 0;
			const bTime = b.state.dataUpdatedAt || 0;
			return bTime - aTime;
		});

		for (const query of sortedQueries) {
			if (query.state.status === "success" && query.state.data) {
				const cachedData = query.state.data as
					| { products: ProductV2[] }
					| undefined;

				if (cachedData?.products) {
					const cachedProduct = cachedData.products.find(
						(p) =>
							p.id === productId && (version ? p.version == version : true),
					);

					if (cachedProduct) {
						return cachedProduct;
					}
				}
			}
		}

		return null;
	};

	return { getCachedProduct };
};
