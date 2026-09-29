import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type ApiKeysLastUsed = Record<string, number>;

export const useApiKeysLastUsedQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["api-keys-last-used"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{ last_used: ApiKeysLastUsed }>(
				"/dev/api_keys/last_used",
			);
			return data.last_used;
		},
		staleTime: 60_000,
	});

	return { lastUsed: data, isLoading };
};
