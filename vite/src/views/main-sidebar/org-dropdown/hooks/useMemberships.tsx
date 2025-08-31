import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { AppEnv } from "@autumn/shared";

export const useMemberships = () => {
  const { data, error, isLoading, mutate } = useAxiosSWR({
    url: "/organization/members",
  });
  const { data: session } = useSession();
  const { data: orgs } = useListOrganizations();
  const navigate = useNavigate();
  const env = useEnv();

  // Debug logging
  console.log("useMemberships data:", data);
  console.log("useMemberships error:", error);
  console.log("useMemberships memberships:", data?.memberships);
  console.log("useMemberships invites:", data?.invites);

  const handleRemovedFromOrg = async () => {
    if (!orgs || !session?.session?.activeOrganizationId) return;
    
    const inOrg = orgs.find(
      (org: any) => org.id === session.session.activeOrganizationId,
    );

    if (!inOrg) {
      if (orgs.length > 0) {
        // User has other organizations, switch to the first available one
        await authClient.organization.setActive({
          organizationId: orgs[0].id,
        });
        // Redirect to products page of the new organization
        const envPath = env === AppEnv.Sandbox ? 'sandbox' : 'production';
        navigate(`/${envPath}/products`);
      } else {
        // User has no organizations left, revoke sessions and redirect to sign-in
        const { data, error } = await authClient.revokeSessions();
        console.log("Revoked sessions", data, error);
        navigate("/sign-in");
      }
    }
  };

  useEffect(() => {
    if (!orgs) return;
    handleRemovedFromOrg();
  }, [orgs, session]);

  return {
    memberships: data?.memberships || [],
    invites: data?.invites || [],
    isLoading,
    error,
    mutate,
  };
};
