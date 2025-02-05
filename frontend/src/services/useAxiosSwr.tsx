import useSWR, { SWRConfiguration } from "swr";
import { useAxiosInstance } from "./useAxiosInstance";
import { AppEnv } from "@autumn/shared";
import axios from "axios";

export function useAxiosSWR({
  url,
  env,
  withAuth = true,
  options = {},
}: {
  url: string;
  env: AppEnv;
  withAuth?: boolean;
  options?: SWRConfiguration;
}) {
  const axiosInstance = useAxiosInstance({ env, isAuth: withAuth });

  const fetcher = async (url: string) => {
    try {
      const res = await axiosInstance.get(url);
      return res.data;
    } catch (error) {
      throw error;
    }
  };

  return useSWR(url, fetcher, {
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
  options = {},
}: {
  url: string;
  env: AppEnv;
  data: any;
  withAuth?: boolean;
  options?: SWRConfiguration;
}) {
  const axiosInstance = useAxiosInstance({ env, isAuth: withAuth });

  const fetcher = async (url: string) => {
    try {
      const res = await axiosInstance.post(url, data);
      return res.data;
    } catch (error) {
      throw error;
    }
  };

  return useSWR(url, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}

export function useDemoSWR({ url, apiKey, options = {} }) {
  const axiosInstance = axios.create({
    baseURL: "https://api.useautumn.com/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const fetcher = async (url: string) => {
    try {
      const res = await axiosInstance.get(url);
      return res.data;
    } catch (error) {
      throw error;
    }
  };

  return useSWR(url, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}
