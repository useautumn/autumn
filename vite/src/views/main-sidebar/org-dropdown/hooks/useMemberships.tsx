import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useMemberships = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, error, isLoading, refetch } = useQuery({
		queryKey: buildKey(["organization-members"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get("/organization/members");
			return data;
		},
	});

	return {
		memberships: data?.memberships || [],
		invites: data?.invites || [],
		isLoading,
		error,
		refetch,
	};
};
