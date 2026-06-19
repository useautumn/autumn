import type { FullInvite } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router";
import { useSwitchActiveOrg } from "@/hooks/common/useOrg";
import { authClient, useSession } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import LoadingScreen from "../general/LoadingScreen";

export const AcceptInvitation = () => {
	const { data: session, isPending } = useSession();
	const [searchParams] = useSearchParams();
	const invitationId = searchParams.get("id");
	const axiosInstance = useAxiosInstance();
	const switchActiveOrg = useSwitchActiveOrg();

	const { data: accepted, isError } = useQuery({
		queryKey: ["accept-invitation", invitationId],
		enabled: !!session && !!invitationId,
		retry: false,
		refetchOnWindowFocus: false,
		queryFn: async () => {
			if (!invitationId) return true;

			const { data } = await axiosInstance.get<{ invites: FullInvite[] }>(
				"/organization/invites",
			);
			const invite = data.invites.find((invite) => invite.id === invitationId);
			if (!invite) return true;

			const { error } = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (error) throw error;

			await switchActiveOrg(invite.organization.id);
			return true;
		},
	});

	if (isPending) return <LoadingScreen fullPage />;
	if (!invitationId) return <Navigate to="/" replace />;
	if (!session) {
		return (
			<Navigate
				to={`/sign-in?next=${encodeURIComponent(`/accept?id=${invitationId}`)}`}
				replace
			/>
		);
	}
	if (isError) {
		return (
			<div className="flex min-h-screen w-full items-center justify-center">
				<p className="text-sm text-muted-foreground">
					This invitation is unavailable or has expired.
				</p>
			</div>
		);
	}
	if (accepted) return <Navigate to="/" replace />;

	return <LoadingScreen fullPage />;
};
