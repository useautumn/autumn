import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useEffect } from "react";

export const useMemberships = () => {
  const { data, error, isLoading, mutate } = useAxiosSWR({
    url: "/organization/members",
  });

  // const { data: session } = useSession();
  // const { data: orgs } = useListOrganizations();

  // const handleRemovedFromOrg = async () => {
  //   const inOrg = orgs?.find(
  //     (org: any) => org.id === session?.session?.activeOrganizationId,
  //   );

  //   if (!inOrg) {
  //     if (orgs && orgs.length > 0) {
  //       await authClient.organization.setActive({
  //         organizationId: orgs[0].id,
  //       });
  //     } else {
  //       const { data, error } = await authClient.revokeSessions();
  //       console.log("Revoked sessions", data, error);
  //     }
  //     window.location.reload();
  //   }
  // };

  // useEffect(() => {
  //   if (!orgs) return;
  //   handleRemovedFromOrg();
  // }, [orgs]);

  return {
    memberships: data?.memberships || [],
    invites: data?.invites || [],
    isLoading,
    error,
    mutate,
  };
};
