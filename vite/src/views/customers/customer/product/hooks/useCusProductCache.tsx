import { useQueryClient } from "@tanstack/react-query";
import {
	ACTIVE_STATUSES,
	cusProductToProduct,
	FullCusProduct,
	FullCustomer,
	mapToProductV2,
	notNullish,
	productToCusProduct,
	ProductV2,
} from "@autumn/shared";

export const useCusProductCache = ({
	customerId,
	productId,
	queryStates,
}: {
	customerId: string | undefined;
	productId: string | undefined;
	queryStates: {
		customerProductId: string | undefined;
		version: number | undefined;
		entityId: string | undefined;
	};
}) => {
	const queryClient = useQueryClient();

	const getSortedProductsQueries = () => {
		const queryCache = queryClient.getQueryCache();
		const productsQuery = queryCache.findAll({
			queryKey: ["products"],
		});

		// Sort by most recently updated first to get the freshest data
		const sortedQueries = productsQuery.sort((a, b) => {
			const aTime = a.state.dataUpdatedAt || 0;
			const bTime = b.state.dataUpdatedAt || 0;
			return bTime - aTime;
		});

		return sortedQueries
			.map((query) => query.state.data)
			.filter(notNullish) as {
			products: ProductV2[];
		}[];
	};

	const getCachedCusProduct = (): {
		cusProduct: FullCusProduct | null;
		product: ProductV2;
	} | null => {
		if (!customerId || !productId) return null;

		// Check all cached full customers queries
		const queryCache = queryClient.getQueryCache();
		const customerQuery = queryCache.findAll({
			queryKey: ["customer", customerId],
		});

		// Sort by most recently updated first to get the freshest data
		const sortedQueries = customerQuery.sort((a, b) => {
			const aTime = a.state.dataUpdatedAt || 0;
			const bTime = b.state.dataUpdatedAt || 0;
			return bTime - aTime;
		});

		for (const query of sortedQueries) {
			// Only use data that's not stale and has been successfully fetched
			if (query.state.status === "success" && query.state.data) {
				const cachedData = query.state.data as
					| { customer: FullCustomer }
					| undefined;

				if (cachedData?.customer) {
					const cusProducts = cachedData.customer.customer_products;

					const internalEntityId = queryStates.entityId
						? cachedData.customer.entities.find(
								(entity) => entity.id === queryStates.entityId,
							)?.internal_id
						: cachedData.customer.entity?.internal_id;

					const cusProduct = productToCusProduct({
						productId: productId!,
						cusProducts,
						internalEntityId,
						version: queryStates.version,
						cusProductId: queryStates.customerProductId,
						inStatuses: ACTIVE_STATUSES,
						// version: undefined,
						// cusProductId: undefined,
						// inStatuses: ACTIVE_STATUSES,
					});

					if (cusProduct) {
						const fullProduct = cusProductToProduct({ cusProduct });
						const productV2 = mapToProductV2({ product: fullProduct });
						return {
							cusProduct,
							product: productV2,
						};
					}
				}
			}
		}

		const sortedProductsQueries = getSortedProductsQueries();

		for (const query of sortedProductsQueries) {
			const product = query.products.find(
				(p) =>
					p.id === productId &&
					(queryStates.version ? p.version === queryStates.version : true),
			);
			if (product) {
				return {
					cusProduct: null,
					product,
				};
			}
		}

		return null;
	};

	return { getCachedCusProduct };
};
