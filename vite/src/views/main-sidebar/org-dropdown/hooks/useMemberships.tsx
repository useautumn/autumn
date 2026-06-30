import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useMemberships = () => {
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance({ skipSandbox: true });

	const { data, error, isLoading, refetch } = useQuery({
		queryKey: ["organization-members", org?.id],
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
