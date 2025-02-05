import useSWR from "swr";

import { SWRConfiguration } from "swr";
import { useAutumnContext } from "../providers/AutumnContext";

export function useCustomSwr({
  url,
  options = {},
}: {
  url: string;
  options?: SWRConfiguration;
}) {
  const { publishableKey } = useAutumnContext();

  const fetcher = async (url: string) => {
    try {
      const res = await fetch(url, {
        headers: {
          "x-publishable-key": publishableKey,
        },
      });

      if (res.status !== 200) {
        try {
          let err = await res.json();
          console.log(`Failed to fetch ${url}:`, err);
        } catch (error) {}

        throw new Error("Failed to fetch data");
      }
      return res.json();
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
