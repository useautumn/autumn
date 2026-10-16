import { queryOptions } from "@tanstack/react-query";
import { useCallback } from "react";
import { productDataUrl } from "@/boot/bootRequests";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { PERSIST_META } from "@/lib/queryPersistence";
import type { PlanVariant } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import type { ProductDataResponse } from "../productDataTypes";

export type ProductQueryResponse = ProductDataResponse & {
	variants: PlanVariant[];
	numVersions: number;
	versionCounts: Record<
		number,
		{ active: number; canceled: number; custom: number; trialing: number }
	>;
};

/** Everything the plan page renders comes from this one response, so the
 * page, list-row hover prefetch and version-option prefetch share its key. */
export const useProductDataQueryOptions = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useCallback(
		({
			productId,
			version,
		}: {
			productId: string | undefined;
			version?: number | null;
		}) =>
			queryOptions({
				queryKey: buildKey(["product", productId, version ?? null]),
				queryFn: async () => {
					try {
						const { data } = await axiosInstance.get<ProductQueryResponse>(
							productDataUrl({
								productId: productId as string,
								version: version ?? null,
							}),
						);
						return data;
					} catch (error) {
						throwBackendError(error);
					}
				},
				enabled: !!productId,
				meta: PERSIST_META,
			}),
		[axiosInstance, buildKey],
	);
};
