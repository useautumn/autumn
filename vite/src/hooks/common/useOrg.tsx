import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FrontendOrg } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export const useOrg = () => {
  // const { data, isLoading, error, mutate } = useAxiosSWR({
  //   url: "/organization",
  // });
  const axiosInstance = useAxiosInstance();

  const fetcher = async () => {
    const { data } = await axiosInstance.get("/organization");
    return data;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["org"],
    queryFn: fetcher,
  });

  return { org: data as FrontendOrg, isLoading, error, mutate: refetch };
};
