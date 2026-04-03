import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useGeneralQuery = ({
	url,
	method,
	queryKey,
	enabled,
}: {
	url: string;
	method: "GET" | "POST" | "PUT" | "DELETE";
	queryKey?: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async () => {
		const { data } = await axiosInstance.request({
			method,
			url,
		});

		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(queryKey || ["general", url]),
		queryFn: fetcher,
		enabled,
	});

	return { data, isLoading, error, refetch };
};
