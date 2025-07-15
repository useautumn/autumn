import useSWR, { SWRConfiguration } from "swr";
import { useAxiosInstance } from "./useAxiosInstance";
import { AppEnv } from "@autumn/shared";
import axios from "axios";

export function useAxiosSWR({
  url,
  env,
  withAuth = true,
  options = {},
  enabled = true,
}: {
  url: string;
  env?: AppEnv;
  withAuth?: boolean;
  options?: SWRConfiguration;
  enabled?: boolean;
}) {
  const axiosInstance = useAxiosInstance({ isAuth: withAuth });

  const fetcher = async (url: string) => {
    const res = await axiosInstance.get(url);
    return res.data;
  };

  return useSWR(enabled ? url : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}

export function useAxiosPostSWR({
  url,
  env,
  data,
  withAuth = true,
  enabled = true,
  options = {},
  queryKey,
}: {
  url: string;
  env?: AppEnv;
  data: any;
  withAuth?: boolean;
  options?: SWRConfiguration;
  enabled?: boolean;
  queryKey?: any[];
}) {
  const axiosInstance = useAxiosInstance();

  const fetcher = async (url: string) => {
    const res = await axiosInstance.post(url, data);
    return res.data;
  };

  return useSWR(enabled ? url : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}

export function usePostSWR({
  url,
  data,
  enabled = true,
  options = {},
  queryKey,
  method = "post",
}: {
  url: string;
  data?: any;
  enabled?: boolean;
  options?: SWRConfiguration;
  queryKey?: any[];
  method?: "post" | "get";
}) {
  const axiosInstance = useAxiosInstance();

  const fetcher = async () => {
    if (method === "post") {
      const res = await axiosInstance.post(url, data);
      return res.data;
    } else {
      const res = await axiosInstance.get(url);
      return res.data;
    }
  };

  return useSWR(enabled ? queryKey || url : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}

export function useDemoSWR({
  url,
  publishableKey,
  options = {},
  endpoint = "https://api.useautumn.com",
}: {
  url: string;
  publishableKey: string;
  options?: SWRConfiguration;
  endpoint?: string;
}) {
  const axiosInstance = axios.create({
    baseURL: endpoint,
    headers: {
      "x-publishable-key": publishableKey,
    },
  });

  const fetcher = async (url: string) => {
    const res = await axiosInstance.get(url);
    return res.data;
  };

  return useSWR(url, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}
