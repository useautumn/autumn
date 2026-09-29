import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type ApiKeysLastUsed = {
	isLoading: boolean;
	/** False when usage data couldn't be read, so absence can't mean "unused". */
	isAvailable: boolean;
	lastUsed: Record<string, number>;
};

export const useApiKeysLastUsedQuery = (): ApiKeysLastUsed => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["api-keys-last-used"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				available: boolean;
				last_used: Record<string, number>;
			}>("/dev/api_keys/last_used");
			return data;
		},
		staleTime: 60_000,
	});

	return useMemo(
		() => ({
			isLoading,
			isAvailable: data?.available ?? false,
			lastUsed: data?.last_used ?? {},
		}),
		[isLoading, data],
	);
};
