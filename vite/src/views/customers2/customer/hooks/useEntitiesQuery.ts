import type { Entity } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type UseEntitiesQueryOptions = {
	search?: string;
	limit?: number;
	enabled?: boolean;
};

export const useEntitiesQuery = ({
	search,
	limit = 50,
	enabled = true,
}: UseEntitiesQueryOptions = {}) => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async (): Promise<{
		list: Entity[];
		total: number;
		total_count: number;
	}> => {
		const params = new URLSearchParams();
		if (search) params.set("search", search);
		if (limit) params.set("limit", String(limit));

		const qs = params.toString();
		const url = `/customers/${customer_id}/entities${qs ? `?${qs}` : ""}`;
		const { data } = await axiosInstance.get(url);
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["entities", customer_id, search, limit]),
		queryFn: fetcher,
		enabled: enabled && !!customer_id,
	});

	return {
		entities: (data?.list ?? []) as Entity[],
		total: data?.total ?? 0,
		totalCount: data?.total_count ?? 0,
		isLoading,
		error,
		refetch,
	};
};
