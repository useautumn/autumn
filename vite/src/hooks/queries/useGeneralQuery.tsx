import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery } from "@tanstack/react-query";

export const useGeneralQuery = ({
	url,
	queryKey,
	enabled,
}: {
	url: string;
	queryKey?: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();

	const fetcher = async () => {
		const { data } = await axiosInstance.get(url);
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: queryKey || ["general", url],
		queryFn: fetcher,
		enabled,
	});

	return { data, isLoading, error, refetch };
};
