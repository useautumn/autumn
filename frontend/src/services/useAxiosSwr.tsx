import useSWR, { SWRConfiguration } from "swr";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAxiosInstance } from "./useAxiosInstance";
import { AppEnv } from "@autumn/shared";

// export function useClerkToken() {
//   const { getToken } = useAuth();
//   const [token, setToken] = useState<string | null>(null);

//   useEffect(() => {
//     const fetchToken = async () => {
//       const fetchedToken = await getToken();
//       setToken(fetchedToken);
//     };

//     fetchToken();
//   }, [getToken]);

//   return token;
// }

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

// export function useAuthenticatedPostSWR<T>(
//   url: string,
//   appEnv: AppEnv,
//   data: any,
//   isAuth = true
// ) {
//   const axiosInstance = useAxiosInstance(appEnv, isAuth);

//   const fetcher = async (url: string) => {
//     try {
//       let res = await axiosInstance.post(url, data);
//       return res.data;
//     } catch (error) {
//       throw error;
//     }
//   };

//   return useSWR(url, fetcher);
// }
