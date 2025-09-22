import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullCusProduct, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useParams } from "react-router";
import { useCusProductCache } from "./useCusProductCache";
import { useEffect, useMemo, useState } from "react";
import { debounce } from "lodash";

export const useCusProductQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { customer_id, product_id } = useParams();
	const [queryStates] = useQueryStates({
		version: parseAsInteger,
		customer_product_id: parseAsString,
		entity_id: parseAsString,
	});

	const [stableStates, setStableStates] = useState(queryStates);

	const { getCachedCusProduct } = useCusProductCache({
		customerId: customer_id,
		productId: product_id,
		queryStates: {
			version: stableStates.version ?? undefined,
			customerProductId: stableStates.customer_product_id ?? undefined,
			entityId: stableStates.entity_id ?? undefined,
		},
	});

	const cachedCusProduct = useMemo(getCachedCusProduct, [getCachedCusProduct]);

	const fetcher = async () => {
		const queryParams = {
			version: stableStates.version,
			customer_product_id: stableStates.customer_product_id,
			entity_id: stableStates.entity_id,
		};

		try {
			console.log(
				`Fetching customer product ${product_id} with version ${stableStates.version}`,
			);
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
			stableStates.customer_product_id,
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

	return {
		cusProduct: finalData?.cusProduct,
		product: finalData?.product,
		isLoading: isLoadingWithCache,
		error,
		refetch,
	};
};
