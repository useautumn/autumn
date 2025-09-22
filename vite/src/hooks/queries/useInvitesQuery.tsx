import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullInvite, Invite, User } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

export const useInvitesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const fetcher = async () => {
		const { data } = await axiosInstance.get("/organization/invites");
		return data;
	};
	const { data, isLoading, error, refetch } = useQuery<{
		invites: FullInvite[];
	}>({
		queryKey: ["invitations"],
		queryFn: fetcher,
	});

	return { invites: data?.invites || [], isLoading, error, refetch };
};
