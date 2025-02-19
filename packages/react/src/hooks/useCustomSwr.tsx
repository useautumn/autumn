import useSWR from "swr";

import { SWRConfiguration } from "swr";
import { useAutumnContext } from "../providers/AutumnContext";

export function useCustomSwr({
  path,
  options = {},
}: {
  path: string;
  options?: SWRConfiguration;
}) {
  const { publishableKey, endpoint } = useAutumnContext();

  const fetcher = async (path: string) => {
    try {
      const res = await fetch(`${endpoint}${path}`, {
        headers: {
          "x-publishable-key": publishableKey,
        },
      });

      if (res.status !== 200) {
        try {
          let err = await res.json();
          console.log(`Failed to fetch ${endpoint}${path}:`, err);
        } catch (error) {}

        throw new Error("Failed to fetch data");
      }
      return res.json();
    } catch (error) {
      throw error;
    }
  };

  return useSWR(path, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...options,
  });
}
