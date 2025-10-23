import type { FullCusProduct, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCusProductCache } from "./useCusProductCache";

export const useCusProductQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { customer_id, product_id } = useParams();
	const [queryStates] = useQueryStates({
		version: parseAsInteger,
		id: parseAsString,
		entity_id: parseAsString,
	});

	const [stableStates, setStableStates] = useState(queryStates);

	const { getCachedCusProduct } = useCusProductCache({
		customerId: customer_id,
		productId: product_id,
		queryStates: {
			version: stableStates.version ?? undefined,
			customerProductId: stableStates.id ?? undefined,
			entityId: stableStates.entity_id ?? undefined,
		},
	});

	const cachedCusProduct = useMemo(getCachedCusProduct, []);

	const fetcher = async () => {
		const queryParams = {
			version: stableStates.version,
			customer_product_id: stableStates.id,
			entity_id: stableStates.entity_id,
		};

		try {
			console.log("Query params:", queryParams);
			const { data } = await axiosInstance.get(
				`/customers/${customer_id}/product/${product_id}`,
				{ params: queryParams },
			);
			return data;
		} catch (error) {
			return null;
		}
	};

	const { data, isLoading, error, refetch } = useQuery<{
		cusProduct: FullCusProduct;
		product: ProductV2;
	}>({
		queryKey: [
			"customer_product",
			customer_id,
			product_id,
			stableStates.version,
			stableStates.id,
			stableStates.entity_id,
		],
		queryFn: fetcher,
	});

	useEffect(() => {
		const debouncedSetStableStates = debounce((queryStates: any) => {
			setStableStates(queryStates);
		}, 50);
		debouncedSetStableStates(queryStates);
	}, [queryStates]);

	const finalData = data || cachedCusProduct;
	const isLoadingWithCache = cachedCusProduct ? false : isLoading;
	// const finalData = data;
	// const isLoadingWithCache = isLoading;

	return {
		cusProduct: finalData?.cusProduct,
		product: finalData?.product,
		isLoading: isLoadingWithCache,
		error,
		refetch,
	};
};
