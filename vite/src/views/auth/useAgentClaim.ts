import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { setLastSwitchedOrgId } from "@/lib/orgSync";
import { completeAgentClaim, getAgentClaimDetails } from "./agentClaimApi";

const claimPath = ({ token }: { token: string }) =>
	`/claim?token=${encodeURIComponent(token)}`;

export type ClaimMode = "add" | "switch";

export const useAgentClaim = ({ token }: { token: string }) => {
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending, refetch } = useSession();
	const { refetch: refetchOrganizations } = useListOrganizations();

	const details = useQuery({
		queryKey: ["agent-claim", token],
		queryFn: () => getAgentClaimDetails({ token }),
		enabled: !sessionPending && !!token,
		retry: false,
		refetchOnWindowFocus: false,
	});

	// Frozen on first resolve: the session refetch after claiming flips the
	// active org, which would otherwise re-derive the mode mid-transition.
	const modeRef = useRef<ClaimMode | null>(null);
	const activeOrgId = session?.session.activeOrganizationId;
	const claimedOrgId = details.data?.organization.id;
	if (modeRef.current === null && claimedOrgId) {
		modeRef.current =
			activeOrgId && activeOrgId !== claimedOrgId ? "switch" : "add";
	}

	const completion = useMutation({
		mutationFn: () => completeAgentClaim({ token }),
		onSuccess: async (claimed) => {
			setLastSwitchedOrgId(claimed.organization_id);
			await Promise.all([
				refetch(),
				refetchOrganizations(),
				queryClient.invalidateQueries({ queryKey: ["org"] }),
				queryClient.invalidateQueries({ queryKey: ["members"] }),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
			]);
			window.location.replace("/sandbox/onboarding");
		},
	});

	const signInPath = `/sign-in?next=${encodeURIComponent(claimPath({ token }))}`;

	const switchAccount = async () => {
		await authClient.signOut();
		window.location.href = signInPath;
	};

	return {
		session,
		sessionPending,
		details,
		mode: modeRef.current ?? "add",
		completion,
		signInPath,
		switchAccount,
	};
};
