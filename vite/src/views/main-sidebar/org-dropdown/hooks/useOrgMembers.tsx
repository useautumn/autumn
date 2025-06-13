import { useAxiosSWR } from "@/services/useAxiosSwr";

export const useMemberships = () => {
  const { data, error, isLoading, mutate } = useAxiosSWR({
    url: "/organization/members",
  });

  return {
    memberships: data?.memberships || [],
    invites: data?.invites || [],
    isLoading,
    error,
    mutate,
  };
};
