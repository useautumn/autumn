import type { Membership, Role } from "@autumn/shared";
import { useSession } from "@/lib/auth-client";
import { useMemberships } from "./useMemberships";

export const useCurrentMembership = () => {
	const { memberships, isLoading } = useMemberships();
	const { data } = useSession();
	const userId = data?.session?.userId;

	const currentMembership = memberships.find(
		(m: Membership) => m.user.id === userId,
	);

	const currentRole = currentMembership?.member.role as Role | undefined;
	const isAdmin = currentRole === "admin" || currentRole === "owner";
	const isOwner = currentRole === "owner";

	return {
		currentMembership,
		currentRole,
		isAdmin,
		isOwner,
		userId,
		isLoading,
	};
};
