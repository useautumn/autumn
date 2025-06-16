import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FrontendOrg } from "@autumn/shared";
import { useEffect, useState } from "react";

export const useOrgId = () => {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: organizations, isPending: orgsPending } =
    useListOrganizations();

  const [orgId, setOrgId] = useState<string | null>(null);

  const setFirstOrg = async () => {
    if (organizations?.length === 1) {
      await authClient.organization.setActive({
        organizationId: organizations[0].id,
      });
    }
  };

  useEffect(() => {
    const activeId = session?.session.activeOrganizationId;
    if (activeId) {
      setOrgId(activeId);
    }
  }, [session]);

  // useEffect(() => {
  //   if (!orgId && organizations?.length && organizations.length > 0) {
  //     setFirstOrg();
  //   }
  // }, [session, organizations]);

  useEffect(() => {
    console.log("OrgId", orgId);
  }, [orgId]);

  return {
    orgId,
    isLoading: sessionPending,
  };
};
