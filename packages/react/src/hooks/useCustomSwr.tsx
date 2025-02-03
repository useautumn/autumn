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
