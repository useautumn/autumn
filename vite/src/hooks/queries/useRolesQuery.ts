import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

// TEMPORARY until D4 exports it: swap for `ApiRole` from `@autumn/shared/api/roles/apiRole`.
export type ApiRole = {
	id: string;
	name: string;
	built_in: boolean;
	access: Record<string, "none" | "read" | "write">;
	member_count: number;
	rule_count: number;
};

export const ROLES_QUERY_KEY = ["roles"] as const;

export const useRolesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(ROLES_QUERY_KEY),
		queryFn: async () => {
			const { data } = await axiosInstance.post<{ list: ApiRole[] }>(
				"/roles.list",
				{},
			);
			return data.list;
		},
	});

	return { roles: data ?? [], isLoading, error, refetch };
};
