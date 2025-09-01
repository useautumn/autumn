import { useNavigate } from "react-router";
import { useListOrganizations, useSession } from "@/lib/auth-client";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";

export const useMemberships = () => {
	const { data, error, isLoading, mutate } = useAxiosSWR({
		url: "/organization/members",
	});
	const { data: session } = useSession();
	const { data: orgs } = useListOrganizations();
	const _navigate = useNavigate();
	const _env = useEnv();

	// const handleRemovedFromOrg = async () => {
	//   if (!orgs || !session?.session?.activeOrganizationId) return;

	//   const inOrg = orgs.find(
	//     (org: any) => org.id === session.session.activeOrganizationId
	//   );

	//   if (!inOrg) {
	//     if (orgs.length > 0) {
	//       // User has other organizations, switch to the first available one
	//       await authClient.organization.setActive({
	//         organizationId: orgs[0].id,
	//       });
	//       // Redirect to products page of the new organization
	//       const envPath = env === AppEnv.Sandbox ? "sandbox" : "production";
	//       navigate(`/${envPath}/products`);
	//     } else {
	//       // User has no organizations left, revoke sessions and redirect to sign-in
	//       const { data, error } = await authClient.revokeSessions();
	//       console.log("Revoked sessions", data, error);
	//       navigate("/sign-in");
	//     }
	//   }
	// };

	// useEffect(() => {
	//   if (!orgs) return;
	//   handleRemovedFromOrg();
	// }, [orgs, session]);

	return {
		memberships: data?.memberships || [],
		invites: data?.invites || [],
		isLoading,
		error,
		mutate,
	};
};
