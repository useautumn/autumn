import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FrontendOrg } from "@autumn/shared";
import { useEffect } from "react";

export const useOrg = () => {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/organization",
  });

  // const { data: orgList } = useListOrganizations();

  // useEffect(() => {
  //   if (!data && orgList?.length === 1) {
  //     authClient.organization.setActive({
  //       organizationId: orgList[0].id,
  //     });

  //     mutate();
  //   }
  // }, [data, orgList]);

  return { org: data as FrontendOrg, isLoading, mutate };
};
