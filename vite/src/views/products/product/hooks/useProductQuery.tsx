import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import { useParams } from "react-router";
import type { PlanVariant } from "@/services/products/ProductService";
import type { ProductDataCatalogLicense } from "../productDataTypes";
import {
	type ProductQueryResponse,
	useProductDataQueryOptions,
} from "./useProductDataQueryOptions";

const EMPTY_CATALOG_LICENSES: ProductDataCatalogLicense[] = [];
const EMPTY_VARIANTS: PlanVariant[] = [];
const EMPTY_VERSION_COUNTS: ProductQueryResponse["versionCounts"] = {};

// Product query state...
export const ALL_VARIANTS_VIEW = "all-variants" as const;

export const useProductQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			version: parseAsInteger,
			productId: parseAsString,
			view: parseAsStringLiteral([ALL_VARIANTS_VIEW]),
		},
		{
			history: "push",
		},
	);

	return { queryStates, setQueryStates };
};

export const useAllVariantsView = () => {
	const { queryStates } = useProductQueryState();
	return queryStates.view === ALL_VARIANTS_VIEW;
};

export const useProductQuery = () => {
	const { product_id } = useParams();
	const { queryStates } = useProductQueryState();
	const productId = queryStates.productId || product_id;

	const queryClient = useQueryClient();
	const productDataQueryOptions = useProductDataQueryOptions();

	// Hold the current version on screen until the next one has fully loaded,
	// so a version switch swaps atomically. Never carry data across plans.
	const { data, isLoading, refetch, error } = useQuery({
		...productDataQueryOptions({ productId, version: queryStates.version }),
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[1] === productId ? previous : undefined,
	});

	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: ["product"] });
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["product_counts"] }),
			queryClient.invalidateQueries({ queryKey: ["product_versions"] }),
			queryClient.invalidateQueries({ queryKey: ["migrations"] }),
		]);
	};

	return {
		product: data?.product,
		catalogLicenses: data?.catalogLicenses ?? EMPTY_CATALOG_LICENSES,
		variants: data?.variants ?? EMPTY_VARIANTS,
		numVersions: data?.numVersions || data?.product.version || 1,
		versionCounts: data?.versionCounts ?? EMPTY_VERSION_COUNTS,
		isLoading,
		refetch: async () => {
			await refetch();
			await queryClient.invalidateQueries({ queryKey: ["migrations"] });
		},
		invalidate,
		error,
	};
};
