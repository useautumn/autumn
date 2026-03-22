import { type FullInvite, Invite, User } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useInvitesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const fetcher = async () => {
		const { data } = await axiosInstance.get("/organization/invites");
		return data;
	};
	const { data, isLoading, error, refetch } = useQuery<{
		invites: FullInvite[];
	}>({
		queryKey: buildKey(["invitations"]),
		queryFn: fetcher,
	});

	return { invites: data?.invites || [], isLoading, error, refetch };
};
