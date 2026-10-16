import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { ApiRole } from "@/views/settings/sections/approvals/approvalsStub";

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
